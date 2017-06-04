<icon>

	<script>
		this.on('mount',()=>{
			this.root.innerHTML = require('../../icons/' + this.opts.src)
		})
		this.on('update',()=>{
			this.root.innerHTML = require('../../icons/' + this.opts.src)
		})
	</script>

	<i class="icon"></i>

</icon>
