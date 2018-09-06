import SW from 'ServiceWorker/SW'

// riot route base url set in ./src/view/app.view.js line 47
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

// Register Service Worker
if (process.env.DAPP_SW_ACTIVE) SW.register()
