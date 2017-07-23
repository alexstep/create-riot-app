module.exports = {
	'env': {
        'browser'  : true,
        'commonjs' : true,
        'es6'      : true
    },

    'parserOptions': {

        'ecmaVersion'  : 8,

        'ecmaFeatures' : {
            'jsx': true
        },

        'sourceType': 'module'
    },

    'globals': {
        'riot'      : true,
        '__dirname' : true,
        'process'   : true,
        'App'       : true,
        '$'         : true
    },

    'plugins': ['riot','flowtype'],

    'rules': {
    	// http://eslint.org/docs/rules/indent#options
		'no-tabs'                     : 0,
		'no-invalid-this'             : 1,
		'no-multi-spaces'             : 0,
		'comma-spacing'               : 0,
		'space-before-function-paren' : 0,
		'space-before-blocks'         : 0,
		'guard-for-in'                : 0,
		'max-len'                     : 0,
		'key-spacing'                 : 0,
		'comma-dangle'                : 0,
		'block-spacing'               : 0,
		'camelcase'                   : 0,
		'no-unused'                   : 0,
		'padded-blocks'               : 0,
		'require-jsdoc'               : 0,
		'arrow-parens'                : 0,
		'brace-style'                 : 0,
		'object-curly-spacing'        : 0,
		'keyword-spacing'             : 0,

		'no-trailing-spaces':1,
		'no-multiple-empty-lines':1,

		'no-unused-vars': [
			'warn',
			{
				'vars'               : 'all',
				'args'               : 'after-used',
				'ignoreRestSiblings' : false
			}
		],

        'indent': [
            'warn',
            'tab' // 2
        ],
        'linebreak-style': [
            'warn',
            'unix'
        ],

        // http://eslint.org/docs/rules/quotes#options
        'quotes': [
            'warn',
            'single' // 'double'
        ],

        // http://eslint.org/docs/2.0.0/rules/semi#options
        'semi': [
            'warn',
            'never' // 'always'
        ]
    }
}
