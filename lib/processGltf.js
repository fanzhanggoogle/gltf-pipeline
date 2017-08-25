'use strict';
var Cesium = require('cesium');
var addDefaults = require('./addDefaults');
var addPipelineExtras = require('./addPipelineExtras');
var Promise = require('bluebird');
var readResources = require('./readResources');
var removePipelineExtras = require('./removePipelineExtras');
var updateVersion = require('./updateVersion');
var writeResources = require('./writeResources');

var defaultValue = Cesium.defaultValue;
var defined = Cesium.defined;

module.exports = processGltf;

/**
 * Run a glTF through the gltf-pipeline.
 *
 * @param {Object} gltf A javascript object containing a glTF asset.
 * @param {Object} [options] An object with the following properties:
 * @param {String} [options.basePath] The path to look in when reading external files.
 * @param {Boolean} [options.checkTransparency] Do a more exhaustive check for texture transparency by looking at the alpha channel of each pixel.
 * @returns {Promise} A promise that resolves to the processed glTF.
 */
function processGltf(gltf, options) {
    options = defaultValue(options, {});
    options.decodeImages = options.checkTransparency || defined(options.textureCompressionOptions);

    var preStages = [
        updateVersion,
        addPipelineExtras,
        addDefaults,
        readResources
    ];
    var postStages = [
        writeResources,
        removePipelineExtras
    ];
    var pipelineStages = getStages(options);

    var stages = preStages.concat(pipelineStages, postStages);

    return Promise.mapSeries(stages, function(stage) {
        return stage(gltf, options);
    }).then(function() {
        return gltf;
    });
}

function getStages(options) {
    return []; // TODO
}
