/***************************************** 
    IMPORTANT!
    add this file to .gitignore

    read more about deploy - https://www.npmjs.com/package/ssh-deploy-release
*****************************************/ 

const Deployer = require('ssh-deploy-release')

const options = {
	localPath:  './build',

	// your server
	host:       '185.41.*.*',
	username:   'root',
	password:   'pass',
	deployPath: '/var/www/some_path/'
}

console.log()
console.log('Deploy to ' + options.host + ' in ' + options.deployPath)
console.log()

const deployer = new Deployer(options)

deployer.deployRelease(() => {
	console.log('Succefull deployed!')
})
