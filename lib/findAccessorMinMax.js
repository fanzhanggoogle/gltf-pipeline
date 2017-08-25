'use strict';
var Cesium = require('cesium');

var arrayFill = Cesium.arrayFill;
var ComponentDatatype = Cesium.ComponentDatatype;
var defined = Cesium.defined;

var getAccessorByteStride = require('./getAccessorByteStride');
var numberOfComponentsForType = require('./numberOfComponentsForType');

module.exports = findAccessorMinMax;

/**
 * Finds the min and max values of the accessor.
 * <p>
 * This file is bundled in Cesium and does not require the Node standard library or any third party libraries.
 * </p>
 *
 * @param {Object} gltf A javascript object containing a glTF asset.
 * @param {Object} accessor The accessor object from the glTF asset to read.
 * @returns {{min: Array, max: Array}} min holding the array of minimum values and max holding the array of maximum values.
 *
 * @private
 */
function findAccessorMinMax(gltf, accessor) {
    var bufferViews = gltf.bufferViews;
    var buffers = gltf.buffers;
    var bufferViewId = accessor.bufferView;
    var numberOfComponents = numberOfComponentsForType(accessor.type);
    var min = arrayFill(new Array(numberOfComponents), Number.POSITIVE_INFINITY);
    var max = arrayFill(new Array(numberOfComponents), Number.NEGATIVE_INFINITY);
    var bufferView = bufferViews[bufferViewId];
    var bufferId = bufferView.buffer;
    var buffer = buffers[bufferId];
    var source = buffer.extras._pipeline.source;

    var count = accessor.count;
    var byteStride = getAccessorByteStride(gltf, accessor);
    var byteOffset = accessor.byteOffset + bufferView.byteOffset + source.byteOffset;
    var componentType = accessor.componentType;
    var componentTypeByteLength = ComponentDatatype.getSizeInBytes(componentType);
    var dataView = new DataView(source.buffer);
    var components = new Array(numberOfComponents);

    for (var i = 0; i < count; i++) {
        components = readComponents(dataView, byteOffset, numberOfComponents, componentType, componentTypeByteLength, components);
        for (var j = 0; j < numberOfComponents; j++) {
            var value = components[j];
            min[j] = Math.min(min[j], value);
            max[j] = Math.max(max[j], value);
        }
        byteOffset += byteStride;
    }

    return {
        min : min,
        max : max
    };
}

function readComponents(dataView, byteOffset, numberOfComponents, componentType, componentTypeByteLength, result) {
    var i;
    switch (componentType) {
        case ComponentDatatype.BYTE:
            for (i = 0; i < numberOfComponents; ++i) {
                result[i] = dataView.getInt8(byteOffset + i * componentTypeByteLength);
            }
            return result;
        case ComponentDatatype.UNSIGNED_BYTE:
            for (i = 0; i < numberOfComponents; ++i) {
                result[i] = dataView.getUint8(byteOffset + i * componentTypeByteLength);
            }
            return result;
        case ComponentDatatype.SHORT:
            for (i = 0; i < numberOfComponents; ++i) {
                result[i] = dataView.getInt16(byteOffset + i * componentTypeByteLength, true);
            }
            return result;
        case ComponentDatatype.UNSIGNED_SHORT:
            for (i = 0; i < numberOfComponents; ++i) {
                result[i] = dataView.getUint16(byteOffset + i * componentTypeByteLength, true);
            }
            return result;
        case ComponentDatatype.INT:
            for (i = 0; i < numberOfComponents; ++i) {
                result[i] = dataView.getInt32(byteOffset + i * componentTypeByteLength, true);
            }
            return result;
        case ComponentDatatype.UNSIGNED_INT:
            for (i = 0; i < numberOfComponents; ++i) {
                result[i] = dataView.getUint32(byteOffset + i * componentTypeByteLength, true);
            }
            return result;
        case ComponentDatatype.FLOAT:
            for (i = 0; i < numberOfComponents; ++i) {
                result[i] = dataView.getFloat32(byteOffset + i * componentTypeByteLength, true);
            }
            return result;
        case ComponentDatatype.DOUBLE:
            for (i = 0; i < numberOfComponents; ++i) {
                result[i] = dataView.getFloat64(byteOffset + i * componentTypeByteLength, true);
            }
            return result;
    }
}
