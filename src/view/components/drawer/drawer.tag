import route from 'riot-route'
import $ from 'jquery'
import Swipe from './swipe'

<drawer>
	<script>
		this.user_info = {
			id         : 99,
			photo_url  : process.env.APP_AVATAR_URL,
			first_name : 'Alex',
			last_name  : 'Step'
		}

		this.on('mount',()=>{
			let swipe = new Swipe( {
				wrapper       : $('.drawer-wrap'),
				drawer        : $('#drawer'),
				overlay       : $('.drawer-overlay'),
				drawer_width  : 240,
				handler_width : 50,

				onOpen: ()=>{ this.drawer_open = true  },
				onClose:()=>{ this.drawer_open = false }
			} )
		})

		this.on('update',()=>{ })

		this.drawer_open = false
		this.toggleDrawer = e => {
			if (e) { e.preventDefault() }
			setTimeout(()=>{
				this.drawer_open = !this.drawer_open
				if (this.drawer_open) {
					App.view.sound.tick()
				}
				this.update()
			},100)
		}


		this.menuItemClick = e => {
			App.view.sound.tick()

			let $a   = $(e.currentTarget)
			let $a_p = $(e.currentTarget).parent()

			if (!$a_p.hasClass('selected')) {
				$a_p.siblings().removeClass('selected')
			}

			route( $a.attr('href') )

			setTimeout(()=>{
				this.toggleDrawer()
			}, 290)

			e.preventDefault()
		}
	</script>

	<div class={'drawer-wrap':true, show:this.drawer_open}>
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
						<icon src="dashboard.svg" />
						Dashboard
					</a>
				</li>
				<li class={selected:(App.view.screen=='groups')}>
					<a onclick={menuItemClick} href="/groups/">
						<icon src="group.svg" />
						List
					</a>
				</li>


				<li class={selected:(App.view.screen=='settings')}>
					<a onclick={menuItemClick} href="/settings/">
						<icon src="settings.svg" />
						Settings
					</a>
				</li>
				<li class={selected:(App.view.screen=='logout'), logout:true}>
					<a onclick={menuItemClick} href="#">
						<icon src="logout.svg" />
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
						icon svg {
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
		}
	</style>
</drawer>
