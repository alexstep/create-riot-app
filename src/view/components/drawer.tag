import route from 'riot-route'
import $ from 'jquery'

<drawer>
	<script>
		this.user_info = {
			id:         99,
			photo_url:  process.env.APP_AVATAR_URL,
			first_name: 'Alex',
			last_name:  'Step'
		}

		this.on('mount',()=>{
			this.$drawer_wrap = $('.drawer-wrap')

			this.panInit( this.$drawer_wrap[0] )
		})

		this.drawer_open = false
		this.toggleDrawer = function(e){
			if (this.drawer_open) {
				this.drawer_open = false
			} else {
				App.view.sound.tick()
				this.drawer_open = true
			}

			this.$drawer_wrap.toggleClass('show');
			if (e) { e.preventDefault() }
		}


		this.panInit = function(EL){
			let Hammer   = require('hammerjs')

			this.Pan = {
				drawer_width:  240,
				handler_width: 50, // .drawer-wrap width
				$drawer:       $('#drawer'),
				$overlay:      $('.drawer-overlay'),
				panning:       false,

				start_x:0,
			}
			this.Pan.drawer_width = this.Pan.$drawer.width()

			new Hammer( EL, { prevent_default: false } )
			.on('panstart', (e)=>{
				if (e.center.x>0 && this.drawer_open && e.center.x>0) {
					this.Pan.start_x = e.center.x
				} else {
					this.Pan.start_x = false
				}
			})
			.on('pan', (e)=>{
			  if (e.center.x>0 && e.pointerType == "touch" && (e.direction==2 || e.direction==4)) {
				if (this.Pan.panning || e.pointers[0].clientX <= this.Pan.handler_width || this.drawer_open) {
				if (this.Pan.panning || (e.direction==2 && this.drawer_open) || (e.direction==4 && !this.drawer_open)) {

					this.Pan.panning = true;

					let velocityX = e.velocityX;
					let x = e.center.x
					if (this.Pan.start_x) {
						x += this.Pan.drawer_width-this.Pan.start_x
					}

					if (x > this.Pan.drawer_width) { x = this.Pan.drawer_width; } else if (x < 0) { x = 0; }

					// вытягиваем
					if (e.direction==4) {
						if (x < this.Pan.drawer_width*0.3) {
							this.drawer_open = false;
						} else if (x >= this.Pan.drawer_width*0.3) {
							this.drawer_open = true;
						}
					}
					// затягиваем
					if (e.direction==2) {
						if (x < this.Pan.drawer_width*0.7) {
							this.drawer_open = false;
						} else if (x >= this.Pan.drawer_width*0.7) {
							this.drawer_open = true;
						}
					}

					if ( (x - this.Pan.drawer_width) !== 0 ) {
						this.Pan.$drawer.css('transform', 'translate3d('+(x - this.Pan.drawer_width)+'px,0,0)');
					}

					this.$drawer_wrap.addClass('pan');
					this.Pan.$overlay.css({opacity: (x / this.Pan.drawer_width) });
			  }
			  }
			}
			// Закончили тянуть
			}).on('panend', (e)=>{
				this.$drawer_wrap.removeClass('pan')

				this.Pan.$drawer.removeAttr('style')
				this.Pan.$overlay.removeAttr('style')

				if (this.drawer_open) {
					this.$drawer_wrap.addClass('show')
				} else {
					this.$drawer_wrap.removeClass('show')
				}
				if (e.pointerType == "touch") {
					this.Pan.panning = false;
				}
			});

		} // panInit


		this.menuItemClick = function(e){
			App.view.sound.tick()

			let $a   = $(e.currentTarget)
			let $a_p = $(e.currentTarget).parent()

			if (!$a_p.hasClass('selected')) {
				$a_p.siblings().removeClass('selected')
			}

			setTimeout(()=>{
				route( $a.attr('href') )
				// setTimeout(()=>{
					this.toggleDrawer()
				// }, 290)
			}, 200)

			e.preventDefault()
		}
	</script>

	<div class="drawer-wrap">
		<a onclick={toggleDrawer} href="#toggle_drawer" class="toggle-drawer" draggable="false"><i></i></a>

		<div id="drawer">
			<header style="background-image:url({user_info.photo_max})">
				<a  if={user_info}
					class="user-info"
					target="_blank" rel="noopener"
					href="https://vk.com/id{user_info.id}">
					<figure class="avatar" style="background-image:url({user_info.photo_url})"></figure>
					<em class="name">
						{user_info.first_name}
						{user_info.last_name}
					</em>
				</a>
			</header>

			<ul class="menu-items">
				<li class={selected:(App.view.screen=='dashboard')}>
					<a onclick={menuItemClick} href="/dashboard/">
						<svg class="icon"><use xlink:href="#dashboard"></use></svg>
						Dashboard
					</a>
				</li>
				<li class={selected:(App.view.screen=='groups')}>
					<a onclick={menuItemClick} href="/groups/">
						<svg class="icon"><use xlink:href="#group"></use></svg>
						List
					</a>
				</li>


				<li class={selected:(App.view.screen=='settings')}>
					<a onclick={menuItemClick} href="/settings/">
						<svg class="icon"><use xlink:href="#settings"></use></svg>
						Settings
					</a>
				</li>
				<!-- <li class={selected:(App.view.screen=='pay')}>
					<a onclick={menuItemClick} href="/pay/">
						<svg class="icon"><use xlink:href="#payment"></use></svg>
						Баланс
					</a>
				</li> -->
				<li class={selected:(App.view.screen=='logout'), logout:true}>
					<a onclick={menuItemClick} href="#">
						<svg class="icon"><use xlink:href="#logout"></use></svg>
						Exit
					</a>
				</li>
			</ul>
		</div>
		<div onclick={toggleDrawer} class="drawer-overlay"></div>
	</div>

	<style type="less">
		@drawer_width:  240px;
		@drawer_speed:  0.3s;
		@drawer_bg:     #ffffff;
		@header_height: 205px;

		.drawer-wrap {
			position:absolute; z-index: 9; top:0px; left:0px;
			width: 50px; height: ~"calc(100vh + 100px)";
			background:transparent;
			/*background: rgba(0,0,0,0.6);*/

			.toggle-drawer {
				position: absolute; z-index: 9; top:0px; left:0px;
				display: block;
				width: 58px; height: 58px;

				&:before, &:after, i { content:''; display:block; position: absolute;
					height: 2px; width: 18px;
					background: #fff;
					left:18px; top:22px;
				}
				&:before { top:27px; };
				&:after  { top:32px; };


				&:active, &:hover {
					background-position: -2px -1px;
					background-image: radial-gradient(circle, rgba(0,0,0,0.05) 50%, transparent 0%);
					/*animation: push 0.3s linear;
					@keyframes push {
						0%   { background-image:none; }
						1%   { background-image: radial-gradient(circle, rgba(0,0,0,0.1) 50%, transparent 0%);  }
						100% { background-image:none; }
					}		*/
				}
			}

			.drawer-overlay {
				pointer-events: none;
				position: fixed; z-index:10; top:0; left: 0;
				background: rgba(0,0,0,0.7);
				width: 100vw; height: 100vh;
				transition: opacity 0.3s linear;
				opacity: 0;
			}

			#drawer {
				position: fixed; z-index:11; top:0; left: 0;

				width: 88vw;
				min-width:@drawer_width;
				max-width:320px;
				min-height: 100vh;
				background: @drawer_bg;

				transform:  translate3d(-320px,0,0);
				transition: transform @drawer_speed ease-out;

				box-shadow: 0 0 20px #000; margin-left: -20px;

				.menu-items {
					height:  calc(100vh ~"-" @header_height);
					a {
						.icon {
							width: 25px; height: 25px;
						}
					}
					.logout {
						position: absolute; bottom: 15px;
					}
				}
			}
			&.pan {
				#drawer, .drawer-overlay { transition:none; }
			}
			&.show {
				#drawer {
					transform: translate3d(0,0,0);
				}
				.drawer-overlay { pointer-events: all;
					opacity: 1;
				}
			}

		} // .drawer-wrap {
	</style>
</drawer>
