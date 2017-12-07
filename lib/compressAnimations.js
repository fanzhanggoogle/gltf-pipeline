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

function getNamedAttributeData(gltf, primitive, semantic) {
    var accessorId = primitive.attributes[semantic];
    var accessor = gltf.accessors[accessorId];
    var componentsPerAttribute = numberOfComponentsForType(accessor.type);
    var values = [];
    var type = readAccessor(gltf, accessor, values);
    var packed = packArray(values, type);
    return {
      numComponents : componentsPerAttribute,
      numVertices : accessor.count,
      data : packed
    };
}

function addCompressionExtensionToPrimitive(gltf, primitive,
    attributeToId, encodedLen, encodedData) {
    // Remove properties from accessors.
    // Remove indices bufferView.

    var indicesAccessor = gltf.accessors[primitive.indices];
    var newIndicesAccessor = {
          componentType : indicesAccessor.componentType,
          count : indicesAccessor.count,
          max : indicesAccessor.max,
          min : indicesAccessor.min,
          type : indicesAccessor.type
    };
    var indicesAccessorId = addToArray(gltf.accessors, newIndicesAccessor);
    primitive.indices = indicesAccessorId;

    // Remove attributes bufferViews.
    for (var semantic in primitive.attributes) {
      var attributeAccessor = gltf.accessors[primitive.attributes[semantic]];
      var newAttributeAccessor = {
          componentType : attributeAccessor.componentType,
          count : attributeAccessor.count,
          max : attributeAccessor.max,
          min : attributeAccessor.min,
          type : attributeAccessor.type
      };
      var attributeAccessorId = addToArray(gltf.accessors, newAttributeAccessor);
      primitive.attributes[semantic] = attributeAccessorId;
    }

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

    var extensions = primitive.extensions;
    if (!defined(primitive.extensions)) {
      extensions = {};
      primitive.extensions = extensions;
    }
    var draco_extension = {
      bufferView : bufferViewId,
      attributes : attributeToId, 
    };
    extensions.KHR_draco_mesh_compression = draco_extension;
}

function copyCompressedExtensionToPrimitive(primitive, compressedPrimitive) {
  primitive.attributes = compressedPrimitive.attributes;
  primitive.indices = compressedPrimitive.indices;

  var draco_extension = compressedPrimitive.extensions.KHR_draco_mesh_compression
  var extensions = {};
  primitive.extensions = extensions;
  var copied_extension = {
      bufferView : draco_extension.bufferView,
      attributes : draco_extension.attributes, 
  };
  extensions.KHR_draco_mesh_compression = copied_extension;
}

function compressAnimations(gltf) {
    addExtensionsRequired(gltf, 'Draco_animation_compression');
    var hashPrimitives = [];

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
            
        var timestampsData = [];
        var animationData = [];
        console.log("Input id " + sampler.input);
        console.log("Output id " + sampler.output);
        readAccessor(gltf, gltf.accessors[sampler.input], timestampsData);
        var values = [];
        const type = readAccessor(gltf, gltf.accessors[sampler.output], values);
        const packed = packArray(values, type);
        
        const timestamps = new Float32Array(timestampsData);
        const keyframeAnimation = new Float32Array(packed);

        const numComponents = numberOfComponentsForType(gltf.accessors[sampler.output].type);
        const numFrames = timestamps.length;

        console.log("Number of frames: " + numFrames);
        console.log("Number of components: " + numComponents);
        console.log("Size of animation data: " + keyframeAnimation.length);
        for (var i = 0; i < numFrames; ++i) {
          console.log("Time: " + timestamps[i]);
          for (var j = 0; j < numComponents; j++) {
            console.log(keyframeAnimation[i * numComponents + j]);
          }
        }

        const encoder = new encoderModule.AnimationEncoder();
        const animationBuilder = new encoderModule.AnimationBuilder();
        const dracoAnimation = new encoderModule.KeyframeAnimation();
        animationBuilder.SetKeyframeData(dracoAnimation, numFrames,
            timestamps, numComponents, keyframeAnimation);
            
        let encodedDracoDataArray = new encoderModule.DracoInt8Array();
        const encodedLen = encoder.EncodeAnimationToDracoBuffer(dracoAnimation, encodedDracoDataArray);
        if (encodedLen <= 0) {
          console.log("Error: Encoding failed.");
          return;
        }
        console.log("Encoded size: " + encodedLen);

        encoderModule.destroy(dracoAnimation);
        encoderModule.destroy(encoder);
        encoderModule.destroy(animationBuilder);
      });

    });
    //ForEach.animationSampler(gltf, function(sampler) {
      //ForEach.meshPrimitive(mesh, function(primitive, primitiveId) {
            //var primitiveType = primitive.mode;
            //// Only support triangles now.
            //if (defined(primitive.mode) && primitive.mode !== 4) {
              //console.log("Skipped primitive. Unsupported primitive mode.");
              //return;
            //}

            //// TODO: Use hash map.
            //var primitiveGeometry = {
              //attributes : primitive.attributes,
              //indices : primitive.indices,
              //mode : primitive.mode
            //};
            //var hashValue = hashObject(primitiveGeometry);
            //if (hashPrimitives[hashValue] !== undefined) {
              //console.log('Found duplicate!');
              //// Copy compressed primitive.
              //copyCompressedExtensionToPrimitive(
                  //primitive, hashPrimitives[hashValue]);
              //return;
            //} else {
              //hashPrimitives[hashValue] = primitive;
            //}

            //const encoder = new encoderModule.Encoder();
            //const meshBuilder = new encoderModule.MeshBuilder();
            //const newMesh = new encoderModule.Mesh();

            //// First get the faces and add to geometry.
            //var indicesData = [];
            //readAccessor(gltf, gltf.accessors[primitive.indices], indicesData);
            //const indices = new Uint32Array(indicesData);
            //const numFaces = indices.length / 3;
            //const numIndices = indices.length;

            //console.log("Num of faces: " + numFaces);
            //meshBuilder.AddFacesToMesh(newMesh, numFaces, indices);

            //// Add attributes to mesh.
            //var attributes = primitive.attributes;
            //var attributeToId = {};
            //for (var semantic in attributes) {
                //const attributeData = getNamedAttributeData(gltf, primitive, semantic);
                //const numPoints = attributeData.numVertices;
                //var attributeName = semantic;
                //if (semantic.indexOf('_') !== -1)
                  //attributeName = attributeName.substring(0, semantic.indexOf('_'));

                //const data = new Float32Array(attributeData.data);
                //var attributeId = -1;
                //if (attributeName === 'POSITION' || attributeName === 'NORMAL' ||
                    //attributeName === 'COLOR' ) {
                  //attributeId = meshBuilder.AddFloatAttributeToMesh(newMesh, encoderModule[attributeName],
                      //numPoints, attributeData.numComponents, data);
                //} else if (semantic === 'TEXCOORD_0') {
                  //attributeId = meshBuilder.AddFloatAttributeToMesh(newMesh, encoderModule.TEX_COORD,
                      //numPoints, attributeData.numComponents, data);
                //} else {
                  //attributeId = meshBuilder.AddFloatAttributeToMesh(newMesh, encoderModule.GENERIC,
                      //numPoints, attributeData.numComponents, data);
                //}

                //if (attributeId === -1) {
                  //console.log("Error: Failed adding attribute " + semantic);
                  //return;
                //} else {
                  //attributeToId[semantic] = attributeId;
                //}
            //}

            //let encodedDracoDataArray = new encoderModule.DracoInt8Array();
            //encoder.SetSpeedOptions(5, 5);
            //encoder.SetAttributeQuantization(encoderModule.POSITION, positionQuantization);
            //encoder.SetAttributeQuantization(encoderModule.NORMAL, normalQuantization);
            //encoder.SetAttributeQuantization(encoderModule.TEX_COORD, texcoordQuantization);
            //encoder.SetAttributeQuantization(encoderModule.COLOR, colorQuantization);
            //encoder.SetAttributeQuantization(encoderModule.GENERIC, skinQuantization);
            //encoder.SetEncodingMethod(encoderModule.MESH_EDGEBREAKER_ENCODING);
  
            //const encodedLen = encoder.EncodeMeshToDracoBuffer(newMesh, encodedDracoDataArray);
            //if (encodedLen > 0) {
              //console.log("Encoded size is " + encodedLen);
            //} else {
              //console.log("Error: Encoding failed.");
            //}
            //var encodedData = new Buffer(encodedLen);
            //for (var i = 0; i < encodedLen; i++) {
              //encodedData[i] = encodedDracoDataArray.GetValue(i);
            //}

            //addCompressionExtensionToPrimitive(gltf, primitive,
                //attributeToId, encodedLen, encodedData);
        //});
    //});
    removeAccessors(gltf);
    removeBufferViews(gltf);
    removeBuffers(gltf);
    return gltf;
}
