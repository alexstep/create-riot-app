import route from 'riot-route'
<app>

	<script>
		this.on('mount',()=>{
			route((screen, action, other)=>{
				if (!screen) { screen = 'dashboard' }

				this.topbar_title = screen
				this.update()

				riot.mount(this.refs.mount_point, screen)

				App.view.topbarScrollHide()
			})
		})
	</script>

	<div id="app">
		<topbar title="{topbar_title}"></topbar>
		<drawer></drawer>

		<div ref="mount_point"></div>
	</div>

	<icons></icons>
</app>
