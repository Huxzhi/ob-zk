import { readFileSync, writeFileSync } from 'fs'
import targetVersion from './manifest.json' assert { type: 'json' }

const targetVersionNum = targetVersion.version

// read minAppVersion from manifest.json and bump version to target version
let manifest = JSON.parse(readFileSync('manifest.json', 'utf8'))
const { minAppVersion } = manifest
manifest.version = targetVersionNum
writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t'))

// update versions.json with target version and minAppVersion from manifest.json
let versions = JSON.parse(readFileSync('versions.json', 'utf8'))
versions[targetVersionNum] = minAppVersion
writeFileSync('versions.json', JSON.stringify(versions, null, '\t'))
