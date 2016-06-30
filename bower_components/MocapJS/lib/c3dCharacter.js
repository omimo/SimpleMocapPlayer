var C3DCharacter = C3DCharacter || {};

C3DCharacter = function(n, jm, jg){
	this.name = n;
	
	this.markerMaterial = jm;
	this.makeMarkerGeometryFCN = jg;

	this.originPosition = new THREE.Vector3(0,0,0);

	this.markerdata = [];
	this.ready = false;
	this.scale = 0.1;
	this.markerMeshes = [];

	this.frameTime = 1/30;
	this.frameCount = 0;

	this.animIndex = 0;
	this.animStartTimeRef = 0;
	this.animOffset = 0;
	this.playing = true;

	this.debug = true;

	var self = this;

	//

	this.log = function(m) {
		if (self.debug)
			console.log(self.name + ": "+m.toString());
	};

	this.loadFromURL = function(url, callback) {
		self.log("Loading the mocap file ...");
		Pace.start();
		url2 = "http://www.sfu.ca/~oalemi/webglplayer/" + url;
		self.url = url;
		Papa.parse(url2, {
		worker: true,
		delimiter: ",",	
		dynamicTyping: true,
		download: true,
		header: false,
		complete: function(results) {
			//self.markerdata = results.data;

			for (i=0;i<results.data[0].length;i++) {
				var markerMesh = new THREE.Mesh(self.makeMarkerGeometryFCN(results.data[0][i], self.scale), self.markerMaterial);
				markerMesh.markerIndex = i;
				markerMesh.name = results.data[0][i];
				scene.add(markerMesh);
				self.markerMeshes.push(markerMesh);
			}

			self.markerNames = results.data[0];
			for (f=1;f<results.data.length-3;f+=3) {
				self.markerdata[(f-1)/3] = [];
				for (m=0;m<self.markerNames.length;m++) {
					marker = [];
					marker.x = results.data[f][m];
					marker.y = results.data[f+1][m];
					marker.z = results.data[f+2][m];
					marker.name = self.markerNames[m];
					self.markerdata[(f-1)/3].push(marker);
				} 
			}
			self.frameCount = self.markerdata.length;
			self.log("Done parsing!");	
			self.ready = true;
			if (callback)
				callback();
		}
		});
	};

	this.setOriginPosition = function (x, y, z) {
		self.originPosition.set(x,y,z);
	};

	this.setSkeletonScale = function(s) {
		self.rootMeshes.forEach(function (c) {
			c.scale.set(s,s,s);
		});
		self.jointMeshes[0].scale.set(s,s,s);
		self.jointMeshes[0].position.multiplyScalar(s);
	};


	this.animFrame = function (frame) {
		for (m=0;m<self.markerMeshes.length; m++) {
			self.markerMeshes[m].position.set(self.markerdata[frame][m].x * self.scale + self.originPosition.x,
										 	  self.markerdata[frame][m].y * self.scale + self.originPosition.y,
										 	  self.markerdata[frame][m].z * self.scale + self.originPosition.z);
		}
	};
};

module.exports = C3DCharacter;