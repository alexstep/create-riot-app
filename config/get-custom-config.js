var customizers = require('./customizers')

function getCustomConfig(prod) {
	var prod = prod || false
	var env = env || {}
	var result = Object
	.keys(customizers)
	.reduce(function (finalConfig, customizerKey) {
		var customizer = customizers[customizerKey]
		if (customizer.prod === false && prod === true) {
			return finalConfig
		}

		var envValue = process.env['APP_' + customizerKey]
		if (env && envValue && envValue !== 'false') {
			if (customizer.toArray) {
				var getCustomizer = (prod ? customizer.getProd : customizer.getDev) || customizer.getDev
				finalConfig[customizer.toArray].push(getCustomizer())
			}
			if (customizer.fileRegex) {
				finalConfig.excludedFilesRegex.push(customizer.fileRegex)
			}
			finalConfig.values[customizerKey] = customizer.config || true
		}
		return finalConfig
	}, {
		presets: [],
		babelPlugins: [],
		plugins: [],
		loaders: [],
		values: {},
		excludedFilesRegex: []
	})

	return result
}

module.exports = getCustomConfig
