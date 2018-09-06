/***************************************** 
    IMPORTANT!
    add this file to .gitignore

    read more about deploy - https://www.npmjs.com/package/ssh-deploy-release
*****************************************/ 

console.log('');
console.log('');
console.log('---------------------------------------------');
console.log('  Please config this scripts manualy for your server');
console.log('  ./scrpts/tools/deploy_ssh/config.js');
console.log('  ./scrpts/tools/deploy_ssh/index.js');
console.log('');
console.log('  docs: https://www.npmjs.com/package/ssh-deploy-release ');
console.log('---------------------------------------------');
console.log('');
console.log('');
process.exit()

// npm i ssh-deploy-release
const Deployer = require('ssh-deploy-release')

const options = require('config.js')

console.log()
console.log('Deploy to ' + options.host + ' in ' + options.deployPath)
console.log()

const deployer = new Deployer(options)

deployer.deployRelease(() => {
	console.log('Succefull deployed!')
})
