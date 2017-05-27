import View from './view/app.view.js'

const App = {}
window.App = App

document.addEventListener('DOMContentLoaded', ()=>{
	App.view = new View()
	App.view.start()

	console.log( process.env )

	console.log('')
})
