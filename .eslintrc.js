module.exports = {
    extends: 'standard',
    plugins:['riot'],

    'globals': {
        'riot'      : true ,
        '__dirname' : true ,
        'process'   : true ,
        'App'       : true ,
        '$'         : true
    },
    
    'env': {
      'browser'  : true ,
      'commonjs' : true ,
      'es6'      : true
    },

    'parserOptions': {
      'ecmaVersion'  : 8,
      'ecmaFeatures' : {
        'jsx': true
      },
      'sourceType': 'module'
    },


    rules: {
      // fot vertical aligment
      'no-multi-spaces'         : 'off' ,
      'comma-spacing'           : 'off' ,
      'no-multiple-empty-lines' : 'off' ,
      'key-spacing'             : 'off' ,

      // not error
      'indent'        : 'warn',
      'no-tabs'       : 'warn',
      'arrow-spacing' : 'warn',
      'padded-blocks' : 'warn',
      
      'camelcase'     : /*fuck*/'off',
      
      'space-infix-ops'             : 'warn',
      'space-before-blocks'         : 'warn',
      'object-curly-spacing'        : 'warn',
      'space-before-function-paren' : 'warn',
    }
};