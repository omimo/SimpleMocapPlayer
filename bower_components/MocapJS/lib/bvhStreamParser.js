// BVH parser by Ankit
// Stream by Omid


var BVHStreamParser = function () {
    this.readHeader = function (str, callback) {
            var dataReturn = parseHeader(str);
            var jointStack = dataReturn[0];
            var jointMap = dataReturn[1];
            var jointArray = dataReturn[2];
            var connectivityMatrix = dataReturn[3]
            if (callback)
                callback(new BVHStreamParser.BVH.Skeleton(jointStack[0], jointMap, jointArray, dataReturn[3], 0, dataReturn[5], dataReturn[6]),'BVH');
    };

    function parseHeader(str) {
        var lines = str.split('\n');
        var jointStack = [];
        var jointMap = {};
        var jointArray = [];
        var connectivityMatrix = [];
        var frameCount, frameTime, frameArray = [];
        var i = 0;
        //parse structure
        for (i = 2; i < lines.length; i++) { //  start from 2 to skip the $HEADER$ command
            if (!parseLine(lines[i], jointStack, jointMap, jointArray, connectivityMatrix)) {
                break;
            }
        }

        for (i = i + 1; i < lines.length; i++) {
            var line = lines[i].trim();
            //when encountering last line
            if (line === "")
                break;
            if (line.indexOf("Frames") === 0) {
                frameCount = +(line.split(/\b/)[2]);
            } else if (line.indexOf("Frame Time") === 0) {
                frameTime = +( line.substr(line.indexOf(":") + 1).trim() )
            } else { /// maybe this should be removed
                var parts = line.split(" ");
                for (var j = 0; j < parts.length; j++)
                    parts[j] = +parts[j];
                frameArray.push(parts);
            }
        }

        //parse motion
        return [jointStack, jointMap, jointArray, connectivityMatrix, frameCount, frameTime, frameArray];
    }

    //parses individual line in the bvh file.
    var parseLine = function (line, jointStack, jointMap, jointArray, connectivityMatrix) {
        line = line.trim();
        if (line.indexOf("ROOT") > -1 || line.indexOf("JOINT") > -1 || line.indexOf("End") > -1) {
            var parts = line.split(" ");
            var title = parts[1]; //temporary variable to be used after creating the joint object
            parts[1] = parts[1] + "-" + jointArray.length;
            var joint = new BVHStreamParser.BVH.Joint(parts[1]);
            joint.title = title;
            jointStack.push(joint);

            joint.jointIndex = Object.keys(jointMap).length;
            jointMap[parts[1]] = joint;
            jointArray.push(joint);
            //if the joint is not an end site
            if( line.indexOf("End") != 0 ){
                if (jointArray.length == 1) {
                    joint.channelOffset = 0;
                } else {
                    joint.channelOffset = jointArray[jointArray.length - 2].channelOffset + jointArray[jointArray.length - 2].channelLength;
                }
            }else{
                //channelLength is 0 for end joints
                joint.channelLength = 0;
                joint.channelOffset = jointArray[jointArray.length - 2].channelOffset + jointArray[jointArray.length - 2].channelLength;
            }

        } else if (line.indexOf("{") === 0) {

        } else if (line.indexOf("OFFSET") === 0) {
            var parts = line.split(" ");
            jointStack[jointStack.length - 1]["offset"] = parts.slice(1);
            for(x in jointStack[jointStack.length - 1]["offset"]){
                jointStack[jointStack.length - 1]["offset"][x] = +jointStack[jointStack.length - 1]["offset"][x]
            }
        } else if (line.indexOf("CHANNELS") === 0) {
            var parts = line.split(" ");
            jointStack[jointStack.length - 1].setChannelNames(parts.slice(2));
            jointStack[jointStack.length - 1]["channelLength"] = +parts[1];
        } else if (line.indexOf("}") === 0) {
            if (jointStack.length > 1) {
                child = jointStack.pop();
                jointStack[jointStack.length - 1].children.push(child);
                child.parent = jointStack[jointStack.length - 1];

                connectivityMatrix.push([child.parent, child])
            }
        } else if (line.indexOf("MOTION") == 0) {
            return false;
        }

        return true;
    };
};

BVHStreamParser.BVH = BVHStreamParser.BVH || {};

BVHStreamParser.BVH.Joint = function (name, index) {

    this.name = name;
    this.children = [];
    this.isEndSite = function () {
        return this.children.length == 0;
    };
    this.rotationIndex = {};
    this.positionIndex = {};

    this.getChannels = function () {
        var allChannels = [];
        for (i = 0; i < this.skeleton.frameArray.length; i++) {
            allChannels.push(this.getChannelsAt(i));
        }
        return allChannels;
    };
    this.getChannelsAt = function (frameNum) {
        var channelsAtFrame = this.skeleton.frameArray[frameNum];
        return channelsAtFrame.slice(this.channelOffset, this.channelOffset + this.channelLength);
    };

    this.setChannelNames = function (nameArr){
        this.channelNames = nameArr;
        for(i in this.channelNames){
            var name = this.channelNames[i];
            switch(name){
                case "Xposition": this.positionIndex.x = i; break;
                case "Yposition": this.positionIndex.y = i; break;
                case "Zposition": this.positionIndex.z = i; break;

                case "Xrotation": this.rotationIndex.x = i; break;
                case "Yrotation": this.rotationIndex.y = i; break;
                case "Zrotation": this.rotationIndex.z = i; break;
            }
        }
    }
};

BVHStreamParser.BVH.Skeleton = function (root, map, arr, connectivityMatrix, frameCount, frameTime, frameArray) {
    thisSkeleton = this;
    this.root = root;
    this.jointMap = map;
    this.jointArray = arr;
    this.connectivityMatrix = connectivityMatrix;
    this.frameCount = frameCount;
    this.frameTime = frameTime;
    this.frameArray = frameArray;
    this.bufferSize = 500;

    for (i = 0; i < this.jointArray.length; i++) {
        this.jointArray[i].skeleton = thisSkeleton;
    }

    this.fillFrameArray = function (fa) {
        this.frameArray.push.apply(this.frameArray,fa);
        //this.frameArray.push.apply(this.frameArray,fa);
        
        diff = this.frameArray.length - this.bufferSize;
        // console.log('diff = ' + diff);
        
        /*
        if (diff > 0) 
            for (i=0;i<diff;i++)
                this.frameArray.shift();

        this.frameCount = this.frameArray.length;
        */
         
        if (diff > 0) 
            addedCount = this.frameCount;
        else
            addedCount = fa.length;

        for(j=0; j < this.jointArray.length; j++){
            var joint = this.jointArray[j];
            updateWithPositionsSinceLast(joint, addedCount);
        }
        
        return diff;
    }

    this.consumeFrames = function (index) {
        for (i=0;i<=index;i++) {
            this.frameArray.shift();
            for (j=0;j<this.jointArray.length;j++)
                this.jointArray[j].channels.shift();
        }
        this.frameCount = this.frameArray.length;
    }

    this.getChannels = function () {
        return frameArray;
    };
    this.getChannelsAt = function (frameNum) {
    	//How do I know which column is what?
        //Why do you need the column index?
        return frameArray[frameNum];
    };
    this.getFrameRate = function () {
        return frameCount / frameTime;
    };
    this.getSkeleton = function () {
        return root;
    };

    this.getHeadJoint = function () {
    	// do a quick search in the joint names to see if any of them matches head, else return the something!!!!
        return jointMap["Head"];
    };
    this.getPositionsAt = function (frameNum) {
    	//for each joint, calculate its position in XYZ
        //return an array of joints, each with .x, .y, and .z properties
    	posFrame = [];

    	for (j=0;j<this.jointArray.length;j++) {
    		posFrame.push(this.jointArray[j].positions[frameNum]);
    	}

    	posFrame = posFrame.map(function(d) {
			return {
				x : d[0],
				y : d[1],
				z : d[2],
			};
		});

        return posFrame;
    };
    this.getTPose = function () {
    	// This function is basically the same as the getPositionsAt except that all the rotations will be 0
        console.log("Not yet implemented");
    };

    function updatePositions(rootOffset, removeRoot, orientation, camera) {
      //TODO: compelte the specification of this

      for(j=0; j < this.jointArray.length; j++){
          var joint = this.jointArray[j];
          updateWithPositions(joint);
      }
    }

    function updateWithPositions(joint){
        var channelNames = joint.channelNames;
        joint.channels = joint.getChannels();
        joint.rotations = [];
        joint.positions = [];
        joint.rotmat = [];
        for(i in joint.channels){
            var channel = joint.channels[i];
            var xpos = channel[joint.positionIndex.x] || 0,
            ypos =  channel[joint.positionIndex.y] || 0,
            zpos =  channel[joint.positionIndex.z] || 0;
            // xangle =  deg2rad(channel[joint.rotationIndex.x] || 0),
            // yangle =  deg2rad(channel[joint.rotationIndex.y] || 0),
            // zangle= deg2rad(channel[joint.rotationIndex.z] || 0);

            var posMatrix = [xpos, ypos, zpos];

            if(!joint.parent){
                //its the root
                joint.positions[i] = posMatrix;//vectorAdd(joint.offset , posMatrix);
                // ^ we can safely ignore the root's offset
            }
        }
    }

    function updateWithPositionsSinceLast(joint, addedCount){
        var channelNames = joint.channelNames;
        joint.channels = joint.getChannels();
        joint.rotations = [];
        joint.positions = [];
        joint.rotmat = [];
        for(i=joint.channels.length - addedCount;i < joint.channels.length; i++){
            var channel = joint.channels[i];
            var xpos = channel[joint.positionIndex.x] || 0,
            ypos =  channel[joint.positionIndex.y] || 0,
            zpos =  channel[joint.positionIndex.z] || 0;
            // xangle =  deg2rad(channel[joint.rotationIndex.x] || 0),
            // yangle =  deg2rad(channel[joint.rotationIndex.y] || 0),
            // zangle= deg2rad(channel[joint.rotationIndex.z] || 0);

            var posMatrix = [xpos, ypos, zpos];

            if(!joint.parent){
                //its the root
                joint.positions[i] = posMatrix;//vectorAdd(joint.offset , posMatrix);
                // ^ we can safely ignore the root's offset
            }
        }
    }

    function deg2rad(deg){
        return deg * (Math.PI/180);
    }
};

module.exports = BVHStreamParser;