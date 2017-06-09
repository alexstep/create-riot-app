import Hammer from 'hammerjs'
import $ from 'jquery'

export default class Swipe {

	constructor(params) {
		this.wrapper = params.wrapper
		this.drawer  = params.drawer
		this.overlay = params.overlay
		this.drawer_width  = params.drawer_width || 240
		this.handler_width = params.handler_width || 50

		this.onOpenCallback  = params.onOpen
		this.onCloseCallback = params.onClose

		this.panning = false
		this.start_x = 0

		if (this.drawer.width() > 0) {
			this.drawer_width = this.drawer.width()
		}

		new Hammer( this.wrapper[0], { prevent_default: false } )
			.on('panstart' , e => this.start(e) )
			.on('pan'      , e => this.pan(e)   )
			.on('panend'   , e => this.end(e)   )
	}


	start(e){
		if (e.center.x > 0 && this.drawer_open && e.center.x > 0) {
			this.start_x = e.center.x
		} else {
			this.start_x = false
		}
	}

	pan(e){
		if (e.pointerType !== 'touch' || e.center.x <= 0 || [2,4].indexOf(e.direction) < 0) {
			return
		}
		if (!this.panning && e.pointers[0].clientX > this.handler_width && !this.drawer_open) {
			return
		}

		this.panning = true

		let velocityX = e.velocityX
		let x         = e.center.x

		if (this.start_x) {
			x += this.drawer_width - this.start_x
		}

		if (x > this.drawer_width) { x = this.drawer_width }
		if (x < 0) { x = 0 }


		if (e.direction==4) {
			if (x < this.drawer_width*0.3) {
				this.drawer_open = false
			}
			if (x >= this.drawer_width*0.3) {
				this.drawer_open = true
			}
		}

		if (e.direction==2) {
			if (x < this.drawer_width*0.7) {
				this.drawer_open = false
			}
			if (x >= this.drawer_width*0.7) {
				this.drawer_open = true
			}
		}

		if ( (x - this.drawer_width) !== 0 ) {
			this.drawer.css('transform', 'translate3d('+(x - this.drawer_width)+'px,0,0)')
		}

		this.wrapper.addClass('pan')
		this.overlay.css({opacity: (x / this.drawer_width) })
	}

	end(e){
		this.wrapper.removeClass('pan')

		this.drawer.removeAttr('style')
		this.overlay.removeAttr('style')

		if (this.drawer_open) {
			this.wrapper.addClass('show')
			this.onOpenCallback()
		} else {
			this.wrapper.removeClass('show')
			this.onCloseCallback()
		}
		if (e.pointerType == 'touch') {
			this.panning = false
		}
	}

}
