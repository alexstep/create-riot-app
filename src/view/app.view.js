/*
 * View Init
 */
import './styles/app.less'

import riot  from 'riot'
import route from 'riot-route'
import $     from 'jquery'

export default class View {
	constructor() {
	}

	start(){
		console.group('View::init')

		this.state = {}
		riot.observable(this.state)

		this.importTags()

		riot.mount('*')

		this.routing()

		if (!this.isFontAvaible('Roboto')) {
			$('body').append('<link href="https://fonts.googleapis.com/css?family=Roboto:100,300,400,500,700,900&amp;subset=cyrillic" rel="stylesheet">')
		}

		this.sound  = require('./sounds.js')({sounds_path:'/sounds/'})

		console.groupEnd('View::init')
	}

	importTags() {
		let tc = require.context('./components/', true, /\.tag$/)
		tc.keys().forEach(function(path){ tc(path) })
	}

	routing() {
		route.base('/')
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

		if ($(window).width() > 1000) {
			return false
		}

		setTimeout(()=>{
			let $scroll_screen = $('.screen[data-topbar="scroll"]')
			if ($scroll_screen.length==0) {
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


