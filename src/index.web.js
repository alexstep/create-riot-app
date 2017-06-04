import View from './view/app.view.js'

const App = {}
window.App = App

// window.onerror = function(a,b,c){
// 	alert(JSON.stringify({a:a,b:b,c:c}))
// }

document.addEventListener('DOMContentLoaded', ()=>{
	App.view = new View()
	App.view.start()

	console.log( 'ENV:', process.env )

	console.log('')
})

// Enable SW in production
// https://github.com/facebookincubator/create-react-app/blob/master/packages/react-scripts/template/README.md#making-a-progressive-web-app
// serviceWorkerRegistration.register()
