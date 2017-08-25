'use strict';
var Cesium = require('cesium');

var defaultValue = Cesium.defaultValue;
var defined = Cesium.defined;

module.exports = addPipelineExtras;

// Objects with these ids should not have extras added
var exceptions = {
    attributes : true,
    targets : true,
    extensions : true,
    extras : true
};

/**
 * Adds extras._pipeline to each object that can have extras in the glTF asset.
 *
 * @param {Object} gltf A javascript object containing a glTF asset.
 * @returns {Object} The glTF asset with the added pipeline extras.
 *
 * @private
 */
function addPipelineExtras(gltf) {
    if (defined(gltf.extras) && defined(gltf.extras._pipeline)) {
        return gltf;
    }
    var objectStack = [gltf];
    while (objectStack.length > 0) {
        var object = objectStack.pop();
        if (Array.isArray(object)) {
            var length = object.length;
            for (var i = 0; i < length; ++i) {
                objectStack.push(object[i]);
            }
        } else if (defined(object) && (typeof object === 'object')) {
            object.extras = defaultValue(object.extras, {});
            object.extras._pipeline = defaultValue(object.extras._pipeline, {});
            for (var name in object) {
                if (object.hasOwnProperty(name)) {
                    if (!defined(exceptions[name])) {
                        objectStack.push(object[name]);
                    }
                }
            }
        }
    }
    return gltf;
}
