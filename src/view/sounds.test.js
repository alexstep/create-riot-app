const sounds = require('./sounds.js')({sounds_path:'/sounds/'})

it('Sound has tick function', () => {
	console.log(sounds.tick())
})

it('Sound has play function', () => {
	console.log(sounds.play())
})
