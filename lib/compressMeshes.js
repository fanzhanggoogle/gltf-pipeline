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
// Prepare encoder for compressing meshes.
var createEncoderModule = require('./draco_encoder_nodejs');
var encoderModule = createEncoderModule({});

module.exports = compressMeshes;

/*
 *
 *
 *
 */

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
    attributesOrder, encodedLen, encodedData) {
    // Remove properties from accessors.
    // Remove indices bufferView.
    var indicesAccessorId = primitive.indices;
    var indicesBufferViewId = gltf.accessors[indicesAccessorId].bufferView;
    delete gltf.accessors[indicesAccessorId].bufferView;
    delete gltf.accessors[indicesAccessorId].byteOffset;
    delete gltf.accessors[indicesAccessorId].byteStride;
    // Remove attributes bufferViews.
    for (var semantic in primitive.attributes) {
      var bufferViewId = gltf.accessors[primitive.attributes[semantic]].bufferView;
      delete gltf.accessors[primitive.attributes[semantic]].bufferView;
      delete gltf.accessors[primitive.attributes[semantic]].byteOffset;
      delete gltf.accessors[primitive.attributes[semantic]].byteStride;
    }

    var buffer = {
        type : "arraybuffer",
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
        byteLength : encodedLen,
        byteOffset : 0,
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
      attributesOrder : attributesOrder, 
      version : "0.9.1",
    };
    extensions.KHR_draco_mesh_compression = draco_extension;
    removeBufferViews(gltf);
}

function compressMeshes(gltf) {
    addExtensionsRequired(gltf, 'KHR_draco_mesh_compression');

    ForEach.mesh(gltf, function(mesh) {
        ForEach.meshPrimitive(mesh, function(primitive, primitiveId) {
            var primitiveType = primitive.mode;
            // Only support triangles now.
            if (primitive.mode !== 4)
              return gltf;

            // TODO: Destroy everything.
            const encoder = new encoderModule.Encoder();
            const meshBuilder = new encoderModule.MeshBuilder();
            let newMesh = meshBuilder.CreateMesh();

            // First get the faces and add to geometry.
            var indicesData = [];
            readAccessor(gltf, gltf.accessors[primitive.indices], indicesData);
            var indices = new Uint32Array(indicesData);
            const numFaces = indices.length / 3;
            const numIndices = indices.length;
            var numPoints = 0;

            console.log("Num of faces: " + numFaces);
            meshBuilder.AddFacesToMesh(newMesh, numFaces, indices);

            // Add attributes to mesh.
            var attributes = primitive.attributes;
            var attributesOrder = [];
            for (var semantic in attributes) {
                var attributeData = getNamedAttributeData(gltf, primitive, semantic);
                numPoints = attributeData.numVertices;
                console.log(semantic + " has " + numPoints + " vertices.");

                if (semantic.indexOf('POSITION') === 0) {
                    var posData = new Float32Array(attributeData.data);
                    meshBuilder.AddFloatAttributeToMesh(newMesh, encoderModule.POSITION,
                        numPoints, attributeData.numComponents, posData);
                    attributesOrder.push("POSITION");
                } else if (semantic.indexOf('NORMAL') === 0) {
                    var normalData = new Float32Array(attributeData.data);
                    meshBuilder.AddFloatAttributeToMesh(newMesh, encoderModule.NORMAL,
                        numPoints, attributeData.numComponents, normalData);
                    attributesOrder.push("NORMAL");
                } else if (semantic.indexOf('TEXCOORD') === 0) {
                    var texcoordData = new Float32Array(attributeData.data);
                    meshBuilder.AddFloatAttributeToMesh(newMesh, encoderModule.TEXCOORD,
                        numPoints, attributeData.numComponents, texcoordData);
                    attributesOrder.push(semantic);
                } else {
                    var genericData = new Float32Array(attributeData.data);
                    meshBuilder.AddFloatAttributeToMesh(newMesh, encoderModule.GENERIC,
                        numPoints, attributeData.numComponents, texcoordData);
                    attributesOrder.push(semantic);
                }
            }
  
            encoder.SetSpeedOptions(5, 5);
            encoder.SetAttributeQuantization(newMesh, encoderModule.POSITION, 12);
            encoder.SetAttributeQuantization(newMesh, encoderModule.NORMAL, 12);
            encoder.SetAttributeQuantization(newMesh, encoderModule.TEXCOORD, 12);
  
            // Encoding.
            let encodedDracoDataArray = new encoderModule.DracoInt8Array();
            const encodedLen = encoder.EncodeMeshToDracoBuffer(newMesh,
                encodedDracoDataArray);
            var encodedData = new Buffer(encodedLen);
            for (var i = 0; i < encodedLen; i++) {
              encodedData[i] = encodedDracoDataArray.GetValue(i);
            }

            // Convert from draco data to built-in data.
            if (encodedLen > 0) {
              console.log("Encoded size is " + encodedLen);
              console.log("Encoded size is " + encodedData.length);
            } else {
              console.log("Error: Encoding failed.");
            }

            addCompressionExtensionToPrimitive(gltf, primitive,
                attributesOrder, encodedLen, encodedData);

            console.log(attributesOrder);
        });
    });
    return gltf;
}
