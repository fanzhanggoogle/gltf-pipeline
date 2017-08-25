'use strict';
var Promise = require('bluebird');
var addDefaults = require('./addDefaults');
var addPipelineExtras = require('./addPipelineExtras');
var dataUriToBuffer = require('./dataUriToBuffer');
var getJsonBufferPadded = require('./getJsonBufferPadded');
var readResources = require('./readResources');
var removePipelineExtras = require('./removePipelineExtras');
var updateVersion = require('./updateVersion');
var writeResources = require('./writeResources');

module.exports = gltfToGlb;

/**
 * Convert a glTF to binary glTF.
 *
 * @param {Object} gltf A javascript object containing a glTF asset.
 * @param {Object} [options] An object with the following properties:
 * @param {String} [options.basePath] The path to look in when reading external files.
 * @returns {Promise} A promise that resolves to a buffer containing the binary glTF.
 */
function gltfToGlb(gltf, options) {
    var stages = [
        updateVersion,
        addPipelineExtras,
        addDefaults,
        readResources,
        writeResources,
        removePipelineExtras
    ];

    return Promise.mapSeries(stages, function(stage) {
        return stage(gltf, options);
    }).then(function() {
        return getGlb(gltf);
    });
}

function getGlb(gltf) {
    var buffer = gltf.buffers[0];
    var binaryBuffer = dataUriToBuffer(buffer.uri);
    delete buffer.uri;

    var jsonBuffer = getJsonBufferPadded(gltf);

    // Allocate buffer (Global header) + (JSON chunk header) + (JSON chunk) + (Binary chunk header) + (Binary chunk)
    var glbLength = 12 + 8 + jsonBuffer.length + 8 + binaryBuffer.length;
    var glb = Buffer.alloc(glbLength);

    // Write binary glTF header (magic, version, length)
    var byteOffset = 0;
    glb.writeUInt32LE(0x46546C67, byteOffset);
    byteOffset += 4;
    glb.writeUInt32LE(2, byteOffset);
    byteOffset += 4;
    glb.writeUInt32LE(glbLength, byteOffset);
    byteOffset += 4;

    // Write JSON Chunk header (length, type)
    glb.writeUInt32LE(jsonBuffer.length, byteOffset);
    byteOffset += 4;
    glb.writeUInt32LE(0x4E4F534A, byteOffset); // JSON
    byteOffset += 4;

    // Write JSON Chunk
    jsonBuffer.copy(glb, byteOffset);
    byteOffset += jsonBuffer.length;

    // Write Binary Chunk header (length, type)
    glb.writeUInt32LE(binaryBuffer.length, byteOffset);
    byteOffset += 4;
    glb.writeUInt32LE(0x004E4942, byteOffset); // BIN
    byteOffset += 4;

    // Write Binary Chunk
    binaryBuffer.copy(glb, byteOffset);
    return glb;
}
