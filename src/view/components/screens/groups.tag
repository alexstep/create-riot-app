<groups>
	<script type="es6">
		this.loading = true
		this.groups  = []

		this.on('mount', ()=>{
			this.loading++
			setTimeout(this.loadData, 2000)
		})

		this.loadData = ()=>{
			for(let i=0; i < 30; i++){
				this.groups.push(
					{id:i, name:`Group ${i}`, items:Math.ceil(Math.random()*1000)*i }
				)
			}

			this.loading = false
			this.update()
		}
	</script>

	<div class="screen screen-groups" id="screen_groups" data-topbar="scroll">
		<spinner if={loading} text="Loading items..."></spinner>

		<div class="groups-list">
			<a if={groups.length} each={group in groups } href="/groups/" onclick={selectGroup} class="ripple group">
				<div class="img-wrap"><img src="{group.photo_100}" ></div>
				<b>{group.name}</b>
				<span class="items" if={group.items}>{group.items} </span>
			</a>
		</div>

		<div if={!loading && !groups.length}>
			<div class="no-groups">
				No content...<br><br>
				<a href="https://vk.com/groups" target="_blank" rel="noopener">Create</a>
			</div>
		</div>
	</div>

	<style type="less">
		.no-groups {
			text-align: center; margin:20% 0;
		}
		.groups-list {
			padding-bottom: 100px;
			.group {
				position: relative;
				display: block;
				vertical-align: top;
				padding: 10px 30px;
				height: 80px;
				.img-wrap {
					background: #aaf;
					display: inline-block;
					overflow: hidden; border-radius: 50%;
					width: 50px; height: 50px;
					img { width: 100% }
					float:left;

					margin:0px;
				}

				color:#333;
				text-decoration:none;
				clear:both;

				b {
					display: inline-block; margin:10px 10px 10px 20px;
					white-space: nowrap; overflow: hidden;
					text-overflow: ellipsis;
					max-width: ~"calc(100vw - 150px)"
				}

				.items {
					color:#aaa; font-size: 11px;
					position: absolute; bottom: 10px; right: 10px;
				}
			} // .group
		}
	</style>
</groups>
