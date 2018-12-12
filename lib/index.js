const fs = require('fs')
const path = require('path')
const map = require('async/map')
const filter = require('async/filter')
const memoize = require('async/memoize')
const constant = require('async/constant')
const waterfall = require('async/waterfall')
const readPackageTree = require('read-package-tree')

const maxLevel = process.env.POWN_MODULES_MAX_LEVEL || Infinity

const flattenModuleTree = (tree, done) => {
    function* unravel(node, level) {
        if (level > maxLevel) {
            return
        } else {
            level = level + 1
        }

        yield {config: node.package.pown, package: node.package, realpath: node.realpath}

        if (level <= maxLevel) {
            for (let i = 0; i < node.children.length; i++) {
                yield* unravel(node.children[i], level)
            }
        }
    }

    done(null, Array.from(unravel(tree, 0)))
}

const loadModuleConfigs = (modules, done) => {
    map(modules, (module, done) => {
        if (module.config) {
            done(null, module)
        } else {
            fs.readFile(path.join(module.realpath, '.pownrc'), (err, data) => {
                if (!err) {
                    try {
                        module.config = JSON.parse(data.toString())
                    } catch (err) {
                        done(err)

                        return
                    }
                }

                done(null, module)
            })
        }
    }, done)
}

const filterPownModules = (modules, done) => {
    filter(modules, (module, done) => {
        done(null, module.config)
    }, done)
}

const defaultRoot = process.env.POWN_ROOT || path.dirname(require.main.filename)

exports.listNodeModules = memoize((root, done) => {
    if (typeof(root) === 'function') {
        done = root
        root = defaultRoot
    }

    const tasks = [
        constant(root, _ => true),
        readPackageTree,
        flattenModuleTree
    ]

    waterfall(tasks, done)
}, root => typeof(root) === 'function' ? defaultRoot : root)

exports.listPownModules = memoize((root, done) => {
    if (typeof(root) === 'function') {
        done = root
        root = defaultRoot
    }

    const tasks = [
        constant(root, _ => true),
        readPackageTree,
        flattenModuleTree,
        loadModuleConfigs,
        filterPownModules
    ]

    waterfall(tasks, done)
}, root => typeof(root) === 'function' ? defaultRoot : root)

exports.list = (callback) => {
    if (callback) {
        return exports.listPownModules(callback)
    } else {
        return new Promise((resolve, reject) => {
            exports.listPownModules((err, modules) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(modules)
                }
            })
        })
    }
}