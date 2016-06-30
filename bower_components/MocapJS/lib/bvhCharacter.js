var parsers = require('./parsers.js');

var BVHCharacter = BVHCharacter || {};


BVHCharacter = function(n, jm, bm, jg, bg) {
	this.name = n;

	this.jointMaterial = jm;
	this.boneMaterial = bm;
	this.makeJointGeometryFCN = jg;
	this.makeBoneGeometryFCN = bg;

	this.bvh = [];
	this.skeleton = new THREE.Group();

	this.skelScale = 1;
	this.jointMeshes = [];
	this.boneMeshes = [];
	this.rootMeshes = [];

	this.originPosition = new THREE.Vector3(0, 0, 0);

	this.ready = false;
	this.frameTime = 1 / 30;
	this.frameCount = 0;
	this.animIndex = 0;
	this.animStartTimeRef = 0;
	this.animOffset = 0;
	this.playing = true;

	this.debug = true;
	this.useWorker = true;

	this.webSocket = [];
	this.streamProtocol = "BVHStream";
	this.keepStreamedFrames = true;
	this.isStreaming = false;

	var self = this;

	//

	this.log = function(m) {
		if (self.debug)
			console.log(self.name + ": " + m.toString());
	};

	this.loadFromURL = function(url, callback) {
		self.log("Loading the mocap file ...");
		//Pace.start();
		reader = new parsers.bvhParser(this.name + "READER");
		this.url = url;
		reader.load(url, self.createSkel, self.fillFrames);

		this.callb = callback;
	};

	this.fillFrames = function() {
		// self.log("Ready!");
		self.ready = true;
		self.playing = true;

		if (self.callb)
			self.callb();
	}

	this.createSkel = function(data) {
		self.bvh = data;
		self.frameCount = data.frameCount;
		self.frameTime = data.frameTime;

		self.log("Mocap file loaded.");

		self.log("Creating the WebGL Joints.");
		self.buildSkelJoints(self.bvh.getSkeleton(), 0);

		self.log("Creating the WebGL Bones.");
		(self.buildSkelBones(self.jointMeshes[0])).forEach(function(c) {
			self.rootMeshes.push(c);
			self.skeleton.add(c);
		});
		self.skeleton.add(self.jointMeshes[0]);
		self.setSkeletonScale(self.skelScale);
		self.setSkelUp();
	};


	// Beginning of the Stream Code
	this.onHeaderReceived = function(data) {
		self.log("Loading the mocap header (skeleton) from the stream...");
		headerReader = new parsers.bvhStreamParser();
		headerReader.readHeader(data, self.createSkel);

		if (self.callb)
			self.callb();

		Pace.stop();
	}

	this.onDataChunckReceived = function(rawFrames) {
		var aa = [];

		for (f = 1; f < rawFrames.length; f++) {
			var parts = rawFrames[f].trim().split(" ");
			for (var j = 0; j < parts.length; j++)
				parts[j] = +parts[j];
			aa.push(parts);
		}
		diff = self.bvh.fillFrameArray(aa);
		self.frameCount = self.bvh.frameArray.length;
		
		
		if (!self.playing) {
			self.animStartTimeRef = Date.now();
			//  self.animOffset -= rawFrames.length;
		}
		/*
		// else
		// self.animOffset = self.animIndex;
		if (diff > 0)
			self.animOffset -= rawFrames.length + 1;
		// self.animIndex -= rawFrames.length; //math.max(0,math.min(rawFrames.length, self.bvh.bufferSize));
		*/
		self.fillFrames();
		Pace.stop();
	}

	this.loadFromStream = function(url, callback) {
		self.log("Connecting to the stream server...");
		self.isStreaming = true;
		this.callb = callback;
		self.webSocket = new WebSocket(url);

		self.webSocket.onerror = function(event) {
			self.log("Error connecting to the stream server " + event.origin);
		};

		self.webSocket.onopen = function(event) {
			self.log("Connected to the stream server " + event.origin);
			Pace.stop();
		};

		self.webSocket.onmessage = function(event) {
			// I'm not doing much of a type and content checking here. Let's just trust the sender for now!
			// Protocol for header:
			// $HEADER$
			// BVH...
			// Protocl for data chunk with id#:
			// $FRAMES$id#$

			var messageLines = event.data.split('\n');

			// self.log("Received somthing!");
			// self.log("The first line is : " + messageLines[0]);

			if (messageLines.length < 1)
				return;

			if (messageLines[0] == "$HEADER$") {
				self.onHeaderReceived(event.data);

			} else if (messageLines[0].startsWith("$FRAMES$")) {
				chunckID = parseInt(messageLines[0].split("$")[2]);
				self.onDataChunckReceived(messageLines, chunckID);
			}
		};

	};

	this.requestFrames = function(i) {
		self.webSocket.send("$GETFRAMES" + i + "$");
	}

	// End of the Stream Code

	this.setOriginPosition = function(x, y, z) {
		self.originPosition.set(x, y, z);
	};

	this.setSkeletonScale = function(s) {
		self.rootMeshes.forEach(function(c) {
			c.scale.set(s, s, s);
		});
		self.jointMeshes[0].scale.set(s, s, s);
		self.jointMeshes[0].position.multiplyScalar(s);
	};

	this.buildSkelJoints = function(joint, parent) {
		var jointMesh = new THREE.Mesh(self.makeJointGeometryFCN(joint.name, self.skelScale), self.jointMaterial);
		jointMesh.bvhIndex = joint.jointIndex;
		jointMesh.offsetVec = new THREE.Vector3(joint.offset[0], joint.offset[1], joint.offset[2]);
		jointMesh.name = joint.name;
		jointMesh.jointparent = parent;
		var a, b, c;
		if (!joint.isEndSite()) {
			a = joint.channelNames[joint.channelNames.length - 3][0];
			b = joint.channelNames[joint.channelNames.length - 2][0];
			c = joint.channelNames[joint.channelNames.length - 1][0];
		}
		jointMesh.rotOrder = a + b + c;
		self.jointMeshes.push(jointMesh);

		joint.children.forEach(function(child) {
			jointMesh.add(self.buildSkelJoints(child, 1));
		});

		return jointMesh;
	};

	this.buildSkelBones = function(jointMesh) {
		var bones = [];
		jointMesh.children.forEach(function(childMesh) {
			// if (typeof childMesh.bvhIndex !== "undefined")
			{
				if (typeof childMesh.bvhIndex === "undefined")
					return;
				// move origin (.translate)
				// rotate
				// translate (offset + position)
				h = math.abs(childMesh.offsetVec.length());
				var bgeometry = self.makeBoneGeometryFCN("", childMesh.name, h, self.skelScale);

				//Begin - Working for MS
				if (childMesh.offsetVec.x < 0)
					bgeometry.rotateZ(3 * math.pi / 2);
				else if (childMesh.offsetVec.x > 0)
					bgeometry.rotateZ(-3 * math.pi / 2);

				if (childMesh.offsetVec.z < 0)
					bgeometry.rotateX(3 * math.pi / 2);
				else if (childMesh.offsetVec.z > 0)
					bgeometry.rotateX(-3 * math.pi / 2);

				bgeometry.translate(childMesh.offsetVec.x / 2, childMesh.offsetVec.y / 2, childMesh.offsetVec.z / 2);

				//END - Working for MS


				var boneMesh = new THREE.Mesh(bgeometry, self.boneMaterial);
				boneMesh.joint = jointMesh;
				boneMesh.name = jointMesh.name + " > " + childMesh.name;
				self.boneMeshes.push(boneMesh);
				// scene.add(boneMesh);
				bones.push(boneMesh);

				(self.buildSkelBones(childMesh)).forEach(function(b) {
					boneMesh.add(b);
				});
			}
		});
		return bones;
	};

	this.animFrame = function(frame) {
		if (frame >= self.frameCount){
			self.playing = false;
			return;
		}
				
				
		this.jointMeshes[0].traverse(function(joint) {
			if (typeof joint.bvhIndex === "undefined")
				return;

			var bj = self.bvh.jointArray[joint.bvhIndex];

			var offsetVec = joint.offsetVec;
			var torad = Math.PI / 180;
			var thisEuler = [];


			thisEuler = new THREE.Euler(
				(bj.channels[frame][bj.rotationIndex.x] * torad),
				(bj.channels[frame][bj.rotationIndex.y] * torad),
				(bj.channels[frame][bj.rotationIndex.z] * torad), joint.rotOrder);


			joint.localRotMat = new THREE.Matrix4();
			joint.localRotMat.makeRotationFromEuler(thisEuler);
			joint.rotation.setFromRotationMatrix(joint.localRotMat);

			if (joint.jointparent != 0) {
				joint.position.set(offsetVec.x, offsetVec.y, offsetVec.z);
			} else { // root
				joint.position.set(
					bj.channels[frame][bj.positionIndex.x] * self.skelScale + self.originPosition.x,
					bj.channels[frame][bj.positionIndex.y] * self.skelScale + self.originPosition.y,
					bj.channels[frame][bj.positionIndex.z] * self.skelScale + self.originPosition.z);
			}
		});

		this.rootMeshes.forEach(function(rootMesh) {
			rootMesh.traverse(function(bone, index) {
				var bj = self.bvh.jointArray[bone.joint.bvhIndex];

				var offsetVec = new THREE.Vector3(bj.offset[0], bj.offset[1], bj.offset[2]);

				bone.rotation.copy(bone.joint.rotation); //setFromRotationMatrix(bone.joint.localRotMat);

				if (bone.parent.type === "Group") //root
				{
					bone.position.set(bj.channels[frame][bj.positionIndex.x] * self.skelScale + self.originPosition.x,
						bj.channels[frame][bj.positionIndex.y] * self.skelScale + self.originPosition.y,
						bj.channels[frame][bj.positionIndex.z] * self.skelScale + self.originPosition.z);
				} else {
					bone.position.set(offsetVec.x,
						offsetVec.y,
						offsetVec.z);
				}

			});
		});
		// if (self.isStreaming && frame >= self.frameCount - 5 ) {
		// 	self.animIndex = self.frameCount - 1;
		// 	self.playing = false;

		// }
		
		if (self.isStreaming) {
			self.log('Cutting from Frame ' + frame);
			console.log(self.frameCount);
			self.bvh.consumeFrames(frame);
			self.frameCount = self.bvh.frameArray.length;
			// console.log(self.frameCount);
			if (self.frameCount <= 0)
				self.playing = false;
				
			self.animOffset = 0;// self.animOffset - frame;
			self.animStartTimeRef = Date.now();
		}
	};

	this.setSkelUp = function() {
		this.jointMeshes[0].traverse(function(joint) {
			if (typeof joint.bvhIndex === "undefined")
				return;

			var bj = self.bvh.jointArray[joint.bvhIndex];

			var offsetVec = joint.offsetVec;
			var torad = Math.PI / 180;
			var thisEuler = [];

			thisEuler = new THREE.Euler(0, 0, 0, joint.rotOrder);

			joint.localRotMat = new THREE.Matrix4();
			joint.localRotMat.makeRotationFromEuler(thisEuler);
			joint.rotation.setFromRotationMatrix(joint.localRotMat);

			if (joint.jointparent != 0) {
				joint.position.set(offsetVec.x, offsetVec.y, offsetVec.z);
			} else { // root
				joint.position.set(self.originPosition.x, self.originPosition.y, self.originPosition.z);
			}
		});

		this.rootMeshes.forEach(function(rootMesh) {
			rootMesh.traverse(function(bone, index) {
				var bj = self.bvh.jointArray[bone.joint.bvhIndex];

				var offsetVec = new THREE.Vector3(bj.offset[0], bj.offset[1], bj.offset[2]);

				bone.rotation.copy(bone.joint.rotation); //setFromRotationMatrix(bone.joint.localRotMat);

				if (bone.parent.type === "Group") //root
				{
					bone.position.set(self.originPosition.x, self.originPosition.y, self.originPosition.z);
				} else {
					bone.position.set(offsetVec.x,
						offsetVec.y,
						offsetVec.z);
				}

			});
		});
	};
};


module.exports = BVHCharacter;