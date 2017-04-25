'use strict';
var Cesium = require('cesium');
var ForEach = require('./ForEach');
var readAccessor = require('./readAccessor');
var numberOfComponentsForType = require('./numberOfComponentsForType');
var addExtensionsRequired = require('./addExtensionsRequired');
var addExtensionsUsed = require('./addExtensionsUsed');
var packArray = require('./packArray');

var defined = Cesium.defined;

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

function addCompressionExtensionToPrimitive(gltf, primitive, encodedData) {
    gltf.accessors[primitive.indices].bufferView = null;
    for (var semantic in primitive.attributes) {
      gltf.accessors[primitive.attributes[semantic]].bufferView = null;
    }
}

function compressMeshes(gltf) {
    ForEach.mesh(gltf, function(mesh) {
        ForEach.meshPrimitive(mesh, function(primitive) {
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
            let encodedData = new encoderModule.DracoInt8Array();
            const encodedLen = encoder.EncodeMeshToDracoBuffer(newMesh,
                encodedData);

            if (encodedLen > 0) {
              console.log("Encoded size is " + encodedLen);
            } else {
              console.log("Error: Encoding failed.");
            }

            addCompressionExtensionToPrimitive(gltf, primitive, encodedData);

            console.log(attributesOrder);
        });
    });
    addExtensionsRequired(gltf, 'KHR_draco_mesh_compression');
    addExtensionsUsed(gltf, 'KHR_draco_mesh_compression');
    return gltf;
}
