
export default class{

	// geoJSON for map display
	mapData = {
		nodes: {
			type: "FeatureCollection",
			features: []					
		},
		routes: {
			type: "FeatureCollection",
			features: []					
		},
		markers: []
	}

	// Mapbox objects
	map = null
	hoveredRoute = null

	// Feature options
	featureOptions = {
		droneRange: 5,
		mode: 'hub-spoke'
	}

 
	// Default options are below
	options = {
		mapbox_token: '',
		mapbox_style: 'mapbox://styles/mapbox/light-v11',
		mapbox_view: {
			zoom: 10,
			centre: {
				lng: -0.164136,
				lat: 51.569356,
			}
		}
	}

	// **********************************************************
	// Constructor, to merge in options
	constructor(options){

		this.options = {...this.options, ...options}

		// Load map
		this.initMap()

	}

	// **********************************************************
	// Start the Sentry
	initMap = async () => {

		// Load the Mapbox map
		this.map = new mapboxgl.Map({
			accessToken: this.options.mapbox_token,
			container: this.options.dom.mapbox,
			style: this.options.mapbox_style,
			center: [this.options.mapbox_view.centre.lng, this.options.mapbox_view.centre.lat],
			zoom: this.options.mapbox_view.zoom,
		})

		// Once the map has loaded
		this.map.on('load', async () => {
			// Startup
			this.initMapLayers()			// Prep mapbox layers
			this.startDOMListeners()	// Starter code change listeners

			// Load initial data
			this.codeChange('csv')		// Trigger initial builds
		})
	}

	// **********************************************************
	// Map stuff

	// Init the layers for map
	initMapLayers = () => {
		this.map.addSource('routes', {type: 'geojson', data: this.mapData.routes, 'promoteId': "id"})
		this.map.addLayer({
			'id': 'routes',
			'type': 'line',
			'source': 'routes',
			'layout': {
				'line-join': 'round',
				'line-cap': 'round'
			},
			'paint': {
				'line-color': `#ffc03a`,
				'line-width': [
					'case',
					['boolean', ['feature-state', 'hover'], false],
					6,
					4
				],
				'line-blur': [
					'case',
					['boolean', ['feature-state', 'hover'], false],
					2,
					8
				],
				'line-opacity': [
					'case', 
					['boolean', ['feature-state', 'withinDroneRange'], false],
					1,
					0
				]
			}
		})

		// Add hover effects to routes
		this.map.on('mousemove', 'routes', (e) => {
			this.map.getCanvas().style.cursor = 'pointer'
			if (e.features.length > 0) {

				for(let feature of e.features){
					if(feature.properties.distance < this.featureOptions.droneRange){
						// Unhighlight current hovered one
						if (this.hoveredRoute !== null) {
							this.map.setFeatureState(
								{source: 'routes', id: this.hoveredRoute},
								{hover: false}
							)
						}

						// Highlight new one
						this.hoveredRoute = feature.id
						this.map.setFeatureState(
							{source: 'routes', id: feature.id},
							{hover: true}
						)
						this.options.follower.set(`${Math.round(feature.properties.distance*10)/10} km`, {style: 'route'})
						break
					}
				}
			}
		})
		this.map.on('mouseleave', 'routes', () => {
			// Clear hover effect
			if (this.hoveredRoute !== null) {
				this.map.setFeatureState(
					{source: 'routes', id: this.hoveredRoute},
					{hover: false}
				)
			}
			this.hoveredRoute = null
			this.options.follower.clear()
		})
	}

	// Add markers from geoJSON
	addMarkers = () => {
		// Clear old markers
		for(let marker of this.mapData.markers){
			marker.remove()
		}

		// Add markers again
		for (const feature of this.mapData.nodes.features) {
			// create a HTML element for each feature
			const el = document.createElement('div')
			el.className = 'marker'
			el.classList.toggle('is_hub', feature.properties.dzType == 'hub')
			const newMarker = new mapboxgl.Marker(el).setLngLat(feature.geometry.coordinates).addTo(this.map)
			this.mapData.markers.push(newMarker)

			// Add marker hover
			newMarker.getElement().addEventListener('mousemove', (e) => {
				this.options.follower.set(`${feature.properties.title}`)
			})
			newMarker.getElement().addEventListener('mouseleave', (e) => {
				this.options.follower.clear()
			})
			newMarker.getElement().addEventListener('click', (e) => {
				this.toggleMarkerHub(feature, newMarker)
			})
		}

		this.generateRoutes()
	}

	toggleMarkerHub = (feature, marker) => {
		if(feature.properties.dzType == 'hub'){
			feature.properties.dzType = ''
		}else{
			feature.properties.dzType = 'hub'
		}
		marker.getElement().classList.toggle('is_hub', feature.properties.dzType == 'hub')
		this.generateRoutes()
	}

	generateRoutes = async () => {

		// Empty existing routes
		this.mapData.routes.features = []

		let start_points
		const end_points = this.mapData.nodes.features

		// Set start points based on link type
		if(this.featureOptions.mode == 'hub-spoke'){
			start_points = this.mapData.nodes.features.filter(feature => feature.properties.dzType == 'hub')
		}else{
			start_points = this.mapData.nodes.features.slice(0, -1) // not last item, otherwise we duplicate some links
		}

		for (let start_index=0; start_index<start_points.length; start_index++) {
			for (let end_index=start_index+1; end_index<end_points.length; end_index++) {
				const distance = turf.distance(start_points[start_index], end_points[end_index], {units: 'kilometers'})
				this.mapData.routes.features.push({
					type: "Feature",
					properties: {
						id: Math.random()*10000,
						from: '',
						end: '',
						distance: distance,
						withinDroneRange: false
					},
					geometry: {
						type: 'LineString',
						coordinates: [
							start_points[start_index].geometry.coordinates,
							end_points[end_index].geometry.coordinates,
						]
					}
				})
			}
		}

		// listener for sourcedata event.
		this.map.on('sourcedata', this.onSourceData);
		this.map.getSource('routes').setData(this.mapData.routes)
	}

	// Helper function to do first call to set drone range once the route data has been loaded onto the map
	onSourceData = (e) => {
		if (e.isSourceLoaded && e.sourceDataType != 'metadata'){ // I worked out these parameter checks by inspection and guesswork, may not be stable!
			this.map.off('sourcedata', this.onSourceData);
			this.setDroneRange(this.featureOptions.droneRange)
		}
	}

	// **********************************************************
	// Code change updates

	startDOMListeners = () => {
		this.options.dom.codeCSV.addEventListener("input", (e) => {
			this.codeChange('csv')
		})
		this.options.dom.codeGeoJSON.addEventListener("input", (e) => {
			this.codeChange('geoJSON')
		})
	}

	// ///////////////////////////////////////////////
	// Triggered whenever the code is changed in the CSV input window
	codeChange = (type) => {
		if(type == 'csv'){
			// Convert CSV to geoJSON
			const newCSV = this.options.dom.codeCSV.value.replace(/\t/gi,',')
			this.options.dom.codeCSV.value = newCSV
			const newGeoJSON = this.parseCSVtoGeoJSON(newCSV.trim())

			console.log(`Adding ${newGeoJSON.features.length} locations`)
			this.mapData.nodes = newGeoJSON
			this.options.dom.codeGeoJSON.value = JSON.stringify(this.mapData.nodes, null, 3)
			this.addMarkers()
		}
	}

	// ///////////////////////////////////////////////
	parseCSVtoGeoJSON = (csv) => {
		const newGeoJSON = {
			type: 'FeatureCollection',
			features: []
		}

		for(let row of csv.split('\n')){
			const parts = row.split(',')
			if(parts.length >= 2){
				// Add new geoJSON
				const title = (parts.length > 2) ? parts[2] : ''
				const type = (parts.length > 3) ? parts[3] : ''
				const dzType = (parts.length > 4) ? parts[4] : ''
				const newLocation = {
					type: 'Feature',
					geometry: {
						type: 'Point',
						coordinates: [parts[1], parts[0]]
					},
					properties: {
						title: title,
						type: type,
						dzType: dzType
					}
				}
				newGeoJSON.features.push(newLocation)
			}
		}
		return newGeoJSON
	}

	// **********************************************************
	// Drone range handling

	setDroneRange = (range) => {
		// Save the range
		this.featureOptions.droneRange = parseInt(range)
		console.log(`Drone range: ${this.featureOptions.droneRange}km`)

		// Clear all routes as being within drone range or not
		for(let feature of this.mapData.routes.features){
			this.map.setFeatureState(
				{source: 'routes', id: feature.properties.id},
				{withinDroneRange: false}
			)
		}
		
		// Filter routes by which ones are within range
		const validRoutes = this.map.querySourceFeatures('routes', {
			sourceLayer: 'routes',
			filter: [
				'all',
				['<', ['to-number', ['get', 'distance']], this.featureOptions.droneRange]
			]
		})
	
		// For each valid route, set the feature as being within range
		validRoutes.forEach((feature) => {
			this.map.setFeatureState(
				{source: 'routes', id: feature.id},
				{withinDroneRange: true}
			)
		})
	}

	// **********************************************************
	// Routing mode handling

	setRouteType = (type) => {
		this.featureOptions.mode = type
		this.generateRoutes()
	}
}