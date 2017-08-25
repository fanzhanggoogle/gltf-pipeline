#!/usr/bin/env node
'use strict';
//
//
// var args = process.argv;
// args = args.slice(2, args.length);
// var options = parseArguments(args);
//
//
// // console.time('optimize');
// // Node automatically waits for all promises to terminate
// processFileToDisk(options.inputPath, options.outputPath, options)
//     .then(function() {
//         console.timeEnd('optimize');
//     });
//
//
//
// var path = require('path');
// var args = process.argv;
// var gltfPath = args[2];
// var glbPath = gltfPath.slice(0, -5) + '.glb';
//
// var fsExtra = require('fs-extra');
// var gltfToGlb = require('../lib/gltfToGlb');
//
// var gltfContents = fsExtra.readFileSync(gltfPath);
// var gltf = JSON.parse(gltfContents);
// var options = {
//     basePath : path.dirname(gltfPath)
// };
// gltfToGlb(gltf, options)
//     .then(function(glb) {
//         fsExtra.outputFileSync(glbPath, glb);
//     });
//
// 'use strict';
// var args = process.argv;
// var glbPath = args[2];
// var gltfPath = glbPath.slice(0, -4) + '.gltf';
//
// var fsExtra = require('fs-extra');
// var glbToGltf = require('../lib/glbToGltf');
//
// var glb = fsExtra.readFileSync(glbPath);
// glbToGltf(glb)
//     .then(function(gltf) {
//         fsExtra.outputJsonSync(gltfPath, gltf);
//     });

var args = process.argv;
var glbPath = args[2];
var glbOptimizedPath = glbPath.slice(0, -4) + '-optimized.glb';

var fsExtra = require('fs-extra');
var glbToGltf = require('../lib/glbToGltf');
var gltfToGlb = require('../lib/gltfToGlb');

var glb = fsExtra.readFileSync(glbPath);
glbToGltf(glb)
    .then(function(gltf) {
        return gltfToGlb(gltf)
            .then(function(glb) {
                fsExtra.outputFileSync(glbOptimizedPath, glb);
            });
    });
