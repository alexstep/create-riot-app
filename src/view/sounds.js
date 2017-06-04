// @flow weak

//
// ♬ Simple module to make sound effects
//
module.exports = function(conf){
	let sounds_path = conf.sounds_path ? conf.sounds_path : '/sounds/'

	let sounds = {}

	function play(filename=false, volume=0.3){
		volume = volume ? volume : 0.3

		if (!filename) { return }

		if (typeof sounds[filename] === 'undefined') {
			// $FlowFixMe
			sounds[filename]        = new Audio()
			sounds[filename].src    = sounds_path+filename
		}

		sounds[filename].volume = volume
		sounds[filename].pause()
		sounds[filename].currentTime = 0

		setTimeout(()=>{
			if (sounds[filename].paused) {
				sounds[filename].play()
			}
		}, 1)

	}

	return {
		play:play,

		tick(volume=0.1){
			let filename = 'tick.ogg'

			if (sounds[filename]) {
				sounds[filename].volume = volume
				sounds[filename].pause()
				sounds[filename].currentTime = 0.02

				sounds[filename].play()

			} else {
				play('tick.ogg', volume)
			}
		}
	}

}
