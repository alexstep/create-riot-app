/*
 * Init client/window
 * mount tags
 */

// Enable HMR in dev mode
if (process.env.NODE_ENV=='development') {
	require('riot-hot-reload')
}

import riot  from 'riot'
import route from 'riot-route'

import $ from 'jquery'

import './styles/app.less'

export default class View {

	start(){
		// create observable App.view.state
		this.state = {}
		riot.observable(this.state)

		// import and mount all tags
		this.importTags()
		riot.mount('*')

		// enable router
		this.routing()

		// Init sounds
		this.sound = require('./sounds.js')({sounds_path:'/sounds/'})

		// append roboto font if not avaible
		if (!this.isFontAvaible('Roboto')) {
			$('body').append('<link href="https://fonts.googleapis.com/css?family=Roboto:100,300,400,500,700,900&amp;subset=cyrillic" rel="stylesheet">')
		}
	}

	importTags() {
		let tc = require.context('./components/', true, /\.tag$/)
		tc.keys().forEach(function(path){ tc(path) })
	}

	routing() {
		// route.base('#')
		route.base('/')
		if (['http:','https:'].indexOf(window.location.protocol)==-1) {
			alert('Riot route base is "/"  - you need run app on server url for correct routing. or change riot base(and links) to # ')
		}

		route.start(true)
	}

	isFontAvaible(font){
		let width
		let body = document.body

		let container = document.createElement('span')
		container.innerHTML = Array(100).join('wi')
		container.style.cssText = [
			'position:absolute',
			'width:auto',
			'font-size:128px',
			'left:-99999px'
		].join(' !important;')

		let getWidth = function (fontFamily) {
			container.style.fontFamily = fontFamily

			body.appendChild(container)
			width = container.clientWidth
			body.removeChild(container)

			return width
		}

		// Pre compute the widths of monospace, serif & sans-serif
		// to improve performance.
		let monoWidth  = getWidth('monospace')
		let serifWidth = getWidth('serif')
		let sansWidth  = getWidth('sans-serif')


		return monoWidth !== getWidth(font + ',monospace') ||
		  sansWidth !== getWidth(font + ',sans-serif') ||
		  serifWidth !== getWidth(font + ',serif')
	}


	topbarScrollHide(){
		$(window).scrollTop(0)

		if ($(window).width() > 800) {
			return false
		}

		setTimeout(()=>{
			let $scroll_screen = $('.screen[data-topbar="scroll"]')
			if ($scroll_screen.length===0) {
				$('body').removeClass('scroll')
				return
			}

			$scroll_screen.css({height:'calc(100vh + '+$('#topbar').height()+'px)'})
			$('body').addClass('scroll')

			let $w = $(window)
			let prev_scroll = 0

			$scroll_screen.off('scroll').on('scroll',(e)=>{
				let st = $w.scrollTop()
				let delta = e.currentTarget.scrollTop-prev_scroll

				if ((delta > 0 && st < 58) || delta < 0) {
					if (st > 0) {
						$(e.currentTarget).scrollTop(prev_scroll)
					}
					$w.scrollTop(st+delta)
					e.preventDefault()
				}
				prev_scroll = e.currentTarget.scrollTop
			})

		},500)
	}
}


