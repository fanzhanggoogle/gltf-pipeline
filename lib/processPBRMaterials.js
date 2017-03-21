'use strict';
var Cesium = require('cesium');
var addExtensionsRequired = require('./addExtensionsRequired');
var addToArray = require('./addToArray');
var ForEach = require('./ForEach');

var defined = Cesium.defined;
var WebGLConstants = Cesium.WebGLConstants;

module.exports = processPBRMaterials;

var semanticTypes = {
    MODELVIEW: WebGLConstants.FLOAT_MAT4,
    PROJECTION: WebGLConstants.FLOAT_MAT4,
    MODELVIEWINVERSETRANSPOSE: WebGLConstants.FLOAT_MAT3
};

function webGLConstantToGlslType(webGLValue) {
    switch (webGLValue) {
        case WebGLConstants.FLOAT:
            return 'float';
        case WebGLConstants.FLOAT_VEC2:
            return 'vec2';
        case WebGLConstants.FLOAT_VEC3:
            return 'vec3';
        case WebGLConstants.FLOAT_VEC4:
            return 'vec4';
        case WebGLConstants.FLOAT_MAT2:
            return 'mat2';
        case WebGLConstants.FLOAT_MAT3:
            return 'mat3';
        case WebGLConstants.FLOAT_MAT4:
            return 'mat4';
        case WebGLConstants.SAMPLER_2D:
            return 'sampler2D';
    }
}

function createVertexShaderPreamble(uniforms, attributes) {
    var vertexShader = 'precision highp float;\n';
    var i;
    for (i = 0; i < uniforms.length; i++) {
        var uniformSemantic = uniforms[i];
        vertexShader += 'uniform ' + webGLConstantToGlslType(semanticTypes[uniformSemantic]) + ' u_' + uniformSemantic.toLowerCase() + ';\n';
    }
    for (var attribute in attributes) {
        if (attributes.hasOwnProperty(attribute)) {
            var options = attributes[attribute];
            vertexShader += 'attribute ' + attributeType + 'a_' + attributeSemantic.toLowerCase() + ';\n';
            vertexShader += 'attribute ' + webGLConstantToGlslType(semanticTypes[attributeSemantic]) + 'v_' + attributeSemantic.toLowerCase() + ';\n';
        }
    }
    for (i = 0; i < attributes.length; i++) {
        var attributeSemantic = attributes[i];

    }
}

function processMetallicRoughnessMaterial(gltf, material, pbr) {
    var baseColor = pbr.baseColorFactor;
    var metallic = pbr.metallicFactor;
    var roughness = pbr.roughnessFactor;

    var uniforms = [
        'MODELVIEW',
        'PROJECTION',
        'MODELVIEWINVERSETRANSPOSE'
    ];

    var attributes = [
        'POSITION',
        'NORMAL'
    ];

    var vertexShader = createVertexShaderPreamble(uniforms, attributes);
}

function processPBRMaterials(gltf) {
    ForEach.material(gltf, function(material) {
        var pbrMetallicRoughness = material.pbrMetallicRoughness;
        if (defined(pbrMetallicRoughness)) {
            processMetallicRoughnessMaterial(gltf, material, pbrMetallicRoughness);
        }
    });
}