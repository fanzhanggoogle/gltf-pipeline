'use strict';
var Cesium = require('cesium');
var hashObject = require('object-hash');
var ForEach = require('./ForEach');
var readAccessor = require('./readAccessor');
var numberOfComponentsForType = require('./numberOfComponentsForType');
var addExtensionsRequired = require('./addExtensionsRequired');
var addExtensionsUsed = require('./addExtensionsUsed');
var packArray = require('./packArray');
var addToArray = require('./addToArray');
var RemoveUnusedProperties = require('./RemoveUnusedProperties');

var defined = Cesium.defined;

var removeBufferViews = RemoveUnusedProperties.removeBufferViews;
var removeBuffers = RemoveUnusedProperties.removeBuffers;
var removeAccessors = RemoveUnusedProperties.removeAccessors;
// Prepare encoder for compressing meshes.
var draco = require('draco-animation');
var encoderModule = draco.createEncoderModule({});

module.exports = compressAnimations;

// For an accessor that has animation data, we create a new accessor and
// duplicate all properities except the bufferView that contains the data.
// And then add the accessor to gltf and replace all input/output that uses
// the old accessor.
function removeDataAndReplaceAccessor(gltf, oldAccessorId) {
    var oldAccessor = gltf.accessors[oldAccessorId];
    var newAccessor = {
          componentType : oldAccessor.componentType,
          count : oldAccessor.count,
          max : oldAccessor.max,
          min : oldAccessor.min,
          type : oldAccessor.type
    };

    var newAccessorId = addToArray(gltf.accessors, newAccessor);
    ForEach.animation(gltf, function(animation) {
      ForEach.animationSampler(animation, function(sampler) {
        if (sampler.input == oldAccessorId) {
          sampler.input = newAccessorId;
        }
        if (sampler.output == oldAccessorId) {
          sampler.output = newAccessorId;
        }
      });
    });
    return newAccessorId;
}

// Go through all accessors and replace them with new accessors that
// don't have bufferViews.
function removeAllSamplerAccessorData(gltf, extractedAnimations) {
    var replacedAccessors = [];
    for (var input in extractedAnimations) {
      // Every input here should always be unique or undefined.
      if (replacedAccessors[input] == undefined) {
        var newAccessorId = removeDataAndReplaceAccessor(gltf, input);
        extractedAnimations[input].input = newAccessorId;
        replacedAccessors[input] = newAccessorId;
      } else {
        // report error.
        console.log("Error: Duplicated input in animation extension.");
      }

      var outputs = extractedAnimations[input].outputs; 
      for (var i = 0; i < outputs.length; ++i) {
        var output = outputs[i];
        if (replacedAccessors[output] == undefined) {
          var newAccessorId = removeDataAndReplaceAccessor(gltf, output);
          outputs[i] = newAccessorId;
          replacedAccessors[output] = newAccessorId;
        } else {
          // report error.
          console.log("Error: Duplicated input in animation extension.");
        }
      }
    }
}

// Add an compressed animation. The gathered array of compressed animations will
// be added to gltf.extensions.Draco_animation_compression later.
function addCompressedAnimation(gltf, compressedAnimation, encodedLen, encodedData) {
    var buffer = {
        byteLength : encodedLen,
        extras : {
            _pipeline : {
                extension : '.bin',
                source :encodedData 
            }
        }
    };
    var bufferId = addToArray(gltf.buffers, buffer);
    var bufferView = {
        buffer : bufferId,
        byteOffset : 0,
        byteLength : encodedLen
    };
    var bufferViewId = addToArray(gltf.bufferViews, bufferView);

    compressedAnimation.bufferView = bufferViewId;
}

function compressAnimations(gltf, options) {
    addExtensionsRequired(gltf, 'Draco_animation_compression');
    options = options === undefined ? {} : options;
    var timestampsQuantization = !defined(options.quantizeTimestamps) ? 16 : options.quantizeTimestamps;
    var keyframesQuantization = options.quantizeKeyframes === undefined ? 16 : options.quantizeKeyframes;

    // We extract animations from glTF and combine them if they
    // have the same input acccessor.
    var extractedAnimations = {};


    ForEach.animation(gltf, function(animation) {
      ForEach.animationSampler(animation, function(sampler) {
        if (!defined(sampler.input) || !defined(sampler.output)) {
          console.log("Error: Animation missing input/output.");
          return;
        }

        if (!defined(sampler.interpolation)) {
          console.log("Error: Animation missing interpolation method.");
          return;
        }

        if (extractedAnimations[sampler.input] == undefined) {
          extractedAnimations[sampler.input] = {};
          extractedAnimations[sampler.input].input = sampler.input;
          extractedAnimations[sampler.input].outputs = [ sampler.output ];
        } else {
          // TODO: Check if already added.
          extractedAnimations[sampler.input].outputs.push(sampler.output);
        }
    
      });
    });

    console.log("List of extracted animations:");
    console.log(extractedAnimations);
    for (var input in extractedAnimations) {
      const encoder = new encoderModule.AnimationEncoder();
      const animationBuilder = new encoderModule.AnimationBuilder();
      const dracoAnimation = new encoderModule.KeyframeAnimation();

      // Prepare timestamps data.
      console.log("Input : " + input);
      var timestampsData = [];
      readAccessor(gltf, gltf.accessors[input], timestampsData);
      const numKeyframes = timestampsData.length;
      console.log("Number of frames : " + numKeyframes);
      const timestamps = new Float32Array(timestampsData);
      animationBuilder.SetTimestamps(dracoAnimation, numKeyframes, timestampsData);


      var outputs = extractedAnimations[input].outputs; 
      extractedAnimations[input].attributesId = [];
      outputs.forEach(function (output) {
        var values = [];
        const type = readAccessor(gltf, gltf.accessors[output], values);
        const numComponents = numberOfComponentsForType(gltf.accessors[output].type);
        const packed = packArray(values, type);
        const keyframeAnimation = new Float32Array(packed);
        const attributeId = animationBuilder.AddKeyframes(dracoAnimation, numKeyframes,
            numComponents, keyframeAnimation);
        if (attributeId <= 0) {
          console.log("Error: Failed adding new keyframes data.");
        }
        extractedAnimations[input].attributesId.push(attributeId);
      });

      console.log(extractedAnimations[input]);
        
      let encodedDracoDataArray = new encoderModule.DracoInt8Array();
  
      // Set quantization bits for the timestamps and keyframres.
      encoder.SetTimestampsQuantization(timestampsQuantization);
      encoder.SetKeyframesQuantization(keyframesQuantization);
      const encodedLen = encoder.EncodeAnimationToDracoBuffer(dracoAnimation, encodedDracoDataArray);
      if (encodedLen <= 0) {
        console.log("Error: Encoding failed.");
        return;
      }
      console.log("Encoded size: " + encodedLen);
      var encodedData = new Buffer(encodedLen);
      for (var i = 0; i < encodedLen; i++) {
        encodedData[i] = encodedDracoDataArray.GetValue(i);
      }

      encoderModule.destroy(dracoAnimation);
      encoderModule.destroy(encoder);
      encoderModule.destroy(animationBuilder);

      addCompressedAnimation(gltf, extractedAnimations[input], encodedLen, encodedData)
    }

    removeAllSamplerAccessorData(gltf, extractedAnimations);
        
    // Here we add gathered compressed animations to extension.
    var extensions = gltf.extensions;
    if (!defined(gltf.extensions)) {
      extensions = {};
      gltf.extensions = extensions;
    }
    if (extensions.Draco_animation_compression == undefined) {
      extensions.Draco_animation_compression = [];
    }
    for (var input in extractedAnimations) {
      extensions.Draco_animation_compression.push(extractedAnimations[input]);
    }

    removeAccessors(gltf);
    removeBufferViews(gltf);
    removeBuffers(gltf);
    return gltf;
}
