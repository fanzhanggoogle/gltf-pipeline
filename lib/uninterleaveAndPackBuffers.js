'use strict';
var Cesium = require('cesium');
var AccessorReader = require('./AccessorReader');
var byteLengthForComponentType = require('./byteLengthForComponentType');
var ForEach = require('./ForEach');
var numberOfComponentsForType = require('./numberOfComponentsForType');
var Remove = require('./Remove');
var writeBufferComponent = require('./writeBufferComponent');

var WebGLConstants = Cesium.WebGLConstants;
var defined = Cesium.defined;

module.exports = uninterleaveAndPackBuffers;

/**
 * Repacks the accessed buffer data into contiguous chunks.
 * Also has the effect of un-interleaving interleaved accessors.
 *
 * The glTF asset must be initialized for the pipeline.
 *
 * @param {Object} gltf A javascript object containing a glTF asset.
 * @returns {Object} The glTF asset with repacked buffers.
 *
 * @see addPipelineExtras
 * @see loadGltfUris
 */
function uninterleaveAndPackBuffers(gltf) {
    var arrayBufferDataOffset = 0;
    var arrayBufferDataLength = 0;
    var elementArrayBufferDataOffset = 0;
    var elementArrayBufferDataLength = 0;
    var otherDataOffset = 0;
    var otherDataLength = 0;

    // compute the total size for each arraybuffer type
    ForEach.accessor(gltf, function (accessor) {
        if (!defined(accessor.bufferView))
            return;
        var bufferView = gltf.bufferViews[accessor.bufferView];
        var accessorLength = byteLengthForComponentType(accessor.componentType) * numberOfComponentsForType(accessor.type) * accessor.count;
        switch (bufferView.target) {
            case WebGLConstants.ARRAY_BUFFER:
                arrayBufferDataLength += accessorLength;
                break;
            case WebGLConstants.ELEMENT_ARRAY_BUFFER:
                elementArrayBufferDataLength += accessorLength;
                break;
            default:
                otherDataLength += accessorLength;
                break;
        }
    });

    // allocate buffer data
    var bufferData = new Buffer(arrayBufferDataLength + elementArrayBufferDataLength + otherDataLength);
    var arrayBufferData = bufferData.slice(0, arrayBufferDataLength);
    var elementArrayBufferData = bufferData.slice(arrayBufferDataLength, arrayBufferDataLength + elementArrayBufferDataLength);
    var otherData = bufferData.slice(arrayBufferDataLength + elementArrayBufferDataLength);

    // read data from accessors into the new buffers
    ForEach.accessor(gltf, function (accessor) {
        if (!defined(accessor.bufferView))
            return;
        var reader = new AccessorReader(gltf, accessor);
        var components = [];
        var bufferView = gltf.bufferViews[accessor.bufferView];
        var componentByteLength = byteLengthForComponentType(accessor.componentType);
        var bytesWritten = 0;

        while (!reader.pastEnd()) {
            reader.read(components);
            var componentsLength = components.length;
            for (var i = 0; i < componentsLength; i++) {
                switch (bufferView.target) {
                    case WebGLConstants.ARRAY_BUFFER:
                        writeBufferComponent(arrayBufferData, accessor.componentType, components[i], arrayBufferDataOffset);
                        arrayBufferDataOffset += componentByteLength;
                        break;
                    case WebGLConstants.ELEMENT_ARRAY_BUFFER:
                        writeBufferComponent(elementArrayBufferData, accessor.componentType, components[i], elementArrayBufferDataOffset);
                        elementArrayBufferDataOffset += componentByteLength;
                        break;
                    default:
                        writeBufferComponent(otherData, accessor.componentType, components[i], otherDataOffset);
                        otherDataOffset += componentByteLength;
                        break;
                }
                bytesWritten += componentByteLength;
            }
            reader.next();
        }
        // assign bufferViews and offsets since we're done reading
        switch (bufferView.target) {
            case WebGLConstants.ARRAY_BUFFER:
                accessor.bufferView = 0;
                accessor.byteOffset = arrayBufferDataOffset - bytesWritten;
                break;
            case WebGLConstants.ELEMENT_ARRAY_BUFFER:
                accessor.bufferView = 1;
                accessor.byteOffset = elementArrayBufferDataOffset - bytesWritten;
                break;
            default:
                accessor.bufferView = 2;
                accessor.byteOffset = otherDataOffset - bytesWritten;
                break;
        }
    });

    // Handle mesh compression extension. The bufferViews are not belong to any
    // accessors.
    var allBuffers = [];
    allBuffers.push(bufferData);
    var bufferOffsetTotal = bufferData.length;
    var compressionBufferViews = [];
    for (var i = 0; i < gltf.bufferViews.length; i++) {
      var bufferView = gltf.bufferViews[i];
      var buffer = gltf.buffers[bufferView.buffer];

      // TODO: Only get part of the buffer data.
      allBuffers.push(buffer.extras._pipeline.source.slice(
          bufferView.byteOffset, bufferView.byteOffset + bufferView.byteLength));
      bufferView.byteOffset = bufferOffsetTotal;
      bufferOffsetTotal += bufferView.byteLength;
      bufferView.buffer = 0;
      compressionBufferViews.push(bufferView);
    }
    bufferData = Buffer.concat(allBuffers, bufferOffsetTotal);
    

    var buffers = [{
        byteLength: bufferData.length,
        extras: {
            _pipeline: {
                source: bufferData,
                extension: '.bin'
            }
        }
    }];

    var bufferViews = [{
        buffer: 0,
        byteLength: arrayBufferDataLength,
        byteOffset: 0,
        byteStride: 0
    }, {
        buffer: 0,
        byteLength: elementArrayBufferDataLength,
        byteOffset: arrayBufferDataLength
    }, {
        buffer: 0,
        byteLength: otherDataLength,
        byteOffset: arrayBufferDataLength + elementArrayBufferDataLength,
        byteStride: 0
    }];
    for (var i = 0; i < compressionBufferViews.length; i++) {
      bufferViews.push(compressionBufferViews[i]);
    }

    gltf.buffers = buffers;
    gltf.bufferViews = bufferViews;

    var removed = 0;
    if (arrayBufferDataLength === 0) {
        Remove.bufferView(gltf, 0);
        removed++;
    }
    if (elementArrayBufferDataLength === 0) {
        Remove.bufferView(gltf, 1 - removed);
        removed++;
    }
    if (otherDataLength === 0) {
        Remove.bufferView(gltf, 2 - removed);
    }
}
