'use strict';
var Promise = require('bluebird');
var addDefaults = require('./addDefaults');
var addPipelineExtras = require('./addPipelineExtras');
var parseGlb = require('./parseGlb');
var readResources = require('./readResources');
var removePipelineExtras = require('./removePipelineExtras');
var updateVersion = require('./updateVersion');
var writeResources = require('./writeResources');

module.exports = glbToGltf;

/**
 * Convert a binary glTF to glTF.
 *
 * @param {Buffer} glb A buffer containing the glb contents.
 * @returns {Promise} A promise that resolves to an object containing a glTF asset.
 */
function glbToGltf(glb) {
    var stages = [
        updateVersion,
        addPipelineExtras,
        addDefaults,
        readResources,
        writeResources,
        removePipelineExtras
    ];

    var gltf = parseBinaryGltf(glb);
    return Promise.mapSeries(stages, function(stage) {
        return stage(gltf);
    }).then(function() {
        return gltf;
    });
}

function parseBinaryGltf(glb) {
    var gltf = parseGlb(glb);

    // Convert buffer source from a Uint8Array to a Buffer
    var buffer = gltf.buffers[0];
    var source = buffer.extras._pipeline.source;
    buffer.extras._pipeline.source = Buffer.from(source.buffer, source.byteOffset, source.byteLength);

    return gltf;
}
