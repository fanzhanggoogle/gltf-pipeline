#!/bin/bash

modelNames=(Box Duck 2CylinderEngine ReciprocatingSaw GearboxAssy Buggy CesiumMan RiggedSimple RiggedFigure Monster VC BrainStem SmilingFace WalkingLady)
#modelNames=(RiggedSimple RiggedFigure BrainStem CesiumMan)
#modelNames=(GearboxAssy)
for modelName in ${modelNames[@]}; do
  echo $modelName
  rm -rf output/* && node ./bin/gltf-pipeline.js -i ~/glTF-Sample-Models/2.0/$modelName/glTF/$modelName.gltf -d -s -o $modelName.gltf && rm -rf ~/gltf-test/sampleModels/$modelName/glTF-Draco/* && cp -r output/* ~/gltf-test/sampleModels/$modelName/glTF-Draco/
done

