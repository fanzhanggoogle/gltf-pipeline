'use strict';
var Cesium = require('cesium');
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
var draco3d = require('draco3d');
var encoderModule = draco3d.createEncoderModule({});

module.exports = compressMeshes;

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
    console.log("Added buffer " + bufferId);
    var bufferView = {
        buffer : bufferId,
        byteOffset : 0,
        byteLength : encodedLen
    };
    var bufferViewId = addToArray(gltf.bufferViews, bufferView);
    console.log("Added bufferView " + gltf.bufferViews);

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

function compressMeshes(gltf) {
    addExtensionsRequired(gltf, 'KHR_draco_mesh_compression');

    ForEach.mesh(gltf, function(mesh) {
        ForEach.meshPrimitive(mesh, function(primitive, primitiveId) {
            var primitiveType = primitive.mode;
            // Only support triangles now.
            if (primitive.mode !== 4)
              return gltf;

            const encoder = new encoderModule.Encoder();
            const meshBuilder = new encoderModule.MeshBuilder();
            const newMesh = new encoderModule.Mesh();

            // First get the faces and add to geometry.
            var indicesData = [];
            readAccessor(gltf, gltf.accessors[primitive.indices], indicesData);
            const indices = new Uint32Array(indicesData);
            const numFaces = indices.length / 3;
            const numIndices = indices.length;

            console.log("Num of faces: " + numFaces);
            meshBuilder.AddFacesToMesh(newMesh, numFaces, indices);

            // Add attributes to mesh.
            var attributes = primitive.attributes;
            var attributeToId = {};
            for (var semantic in attributes) {
                const attributeData = getNamedAttributeData(gltf, primitive, semantic);
                const numPoints = attributeData.numVertices;
                console.log(semantic + " has " + numPoints + " vertices.");

                var attributeName = semantic;
                if (semantic.indexOf('_') !== -1)
                  attributeName = attributeName.substring(0, semantic.indexOf('_'));
                
                console.log("Attribute type is " + attributeName);

                const data = new Float32Array(attributeData.data);
                var attributeId = -1;
                if (attributeName === 'POSITION' || attributeName === 'NORMAL' ||
                    attributeName === 'COLOR' ) {
                  attributeId = meshBuilder.AddFloatAttributeToMesh(newMesh, encoderModule[attributeName],
                      numPoints, attributeData.numComponents, data);
                } else if (semantic === 'TEXCOORD_0') {
                  attributeId = meshBuilder.AddFloatAttributeToMesh(newMesh, encoderModule.TEX_COORD,
                      numPoints, attributeData.numComponents, data);
                } else {
                  attributeId = meshBuilder.AddFloatAttributeToMesh(newMesh, encoderModule.GENERIC,
                      numPoints, attributeData.numComponents, data);
                }

                if (attributeId === -1) {
                  console.log("Error: Failed adding attribute " + semantic);
                  return;
                } else {
                  console.log("Attribute " + semantic + " id : " + attributeId);
                  attributeToId[semantic] = attributeId;
                }
            }

            let encodedDracoDataArray = new encoderModule.DracoInt8Array();
            encoder.SetSpeedOptions(5, 5);
            encoder.SetAttributeQuantization(encoderModule.POSITION, 10);
            encoder.SetAttributeQuantization(encoderModule.NORMAL, 8);
            encoder.SetAttributeQuantization(encoderModule.TEX_COORD, 8);
            encoder.SetAttributeQuantization(encoderModule.COLOR, 6);
            encoder.SetAttributeQuantization(encoderModule.GENERIC, 12);
            encoder.SetEncodingMethod(encoderModule.MESH_EDGEBREAKER_ENCODING);
  
            const encodedLen = encoder.EncodeMeshToDracoBuffer(newMesh, encodedDracoDataArray);
            if (encodedLen > 0) {
              console.log("Encoded size is " + encodedLen);
            } else {
              console.log("Error: Encoding failed.");
            }
            var encodedData = new Buffer(encodedLen);
            for (var i = 0; i < encodedLen; i++) {
              encodedData[i] = encodedDracoDataArray.GetValue(i);
            }

            addCompressionExtensionToPrimitive(gltf, primitive,
                attributeToId, encodedLen, encodedData);
        });
    });
    removeAccessors(gltf);
    removeBufferViews(gltf);
    removeBuffers(gltf);
    return gltf;
}
