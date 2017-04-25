'use strict';
var Cesium = require('cesium');
var ForEach = require('./ForEach');
var readAccessor = require('./readAccessor');
var numberOfComponentsForType = require('./numberOfComponentsForType');
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
      components : componentsPerAttribute,
      data : packed
    };
}

function compressMeshes(gltf) {
    ForEach.mesh(gltf, function(mesh) {
        ForEach.meshPrimitive(mesh, function(primitive) {
            // First get the faces and add to geometry.
            var indicesAccessor = gltf.accessors[primitive.indices];
            var indicesData = [];
            readAccessor(gltf, indicesAccessor, indicesData);
            var indices = new Uint32Array(indicesData);
            var primitiveType = primitive.mode;
            // Only support triangles now.
            if (primitive.mode !== 4)
              return gltf;

            const numFaces = indices.length / 3;
            const numIndices = indices.length;
            // Add attributes to mesh.
            var attributes = primitive.attributes;
            for (var semantic in attributes) {
                if (semantic.indexOf('POSITION') === 0) {
                    console.log(semantic);
                }
                var attributeData = getNamedAttributeData(gltf, primitive, semantic);
                var posData = new Float64Array(attributeData.data);
            }
            const numPoints = posData.length;
            
            // TODO: Destroy everything.
            const encoder = new encoderModule.Encoder();
            const meshBuilder = new encoderModule.MeshBuilder();
            let newMesh = meshBuilder.CreateMesh();

            console.log("Num of faces: " + indices.length / 3);

            meshBuilder.AddFacesToMesh(newMesh, numFaces, indices);
            meshBuilder.AddFloatAttributeToMesh(newMesh, encoderModule.POSITION,
                numPoints, 3, posData);
  
            encoder.SetSpeedOptions(5, 5);
            encoder.SetAttributeQuantization(newMesh, encoderModule.POSITION, 10);
  
            // Encoding.
            let encodedData = new encoderModule.DracoInt8Array();
            const encodedLen = encoder.EncodeMeshToDracoBuffer(newMesh,
                encodedData);

            if (encodedLen > 0) {
              console.log("Encoded size is " + encodedLen);
            } else {
              console.log("Error: Encoding failed.");
            }
        });
    });

    return gltf;
}
