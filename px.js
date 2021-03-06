"use strict";
var lastmove = 0;
document.addEventListener("mousemove", function(e){
	if (e.timeStamp - lastmove < 16){
		e.stopPropagation();
	}else{
		lastmove = e.timeStamp;
	}
});
const renderer = new PIXI.autoDetectRenderer(900, 600, {view:document.getElementById("leftpane"), transparent:true}), noStage = {};
var curStage = noStage;
const interman = require("./InteractionManager");
interman.init(noStage, renderer);
exports.mouse = interman.mouse;
function animate() {
	if (curStage.view){
		renderer.render(curStage.view);
		setTimeout(requestAnimate, 20);
	}
}
function requestAnimate() { requestAnimationFrame(animate); }
exports.mkRenderTexture = function(width, height){
	return new PIXI.RenderTexture(renderer, width, height);
}
exports.getCmd = function(cmd){
	return curStage.cmds ? curStage.cmds[cmd] : null;
}
exports.view = function(stage) {
	if (stage.view){
		if (!curStage.view) requestAnimate();
		renderer.render(stage.view);
		renderer.view.style.display = "";
		interman.stage = stage.view;
	} else {
		interman.stage = noStage;
		renderer.view.style.display = "none";
	}
	curStage = stage;
}
exports.hitTest = interman.hitTest;
exports.setInteractive = function() {
	for (var i = 0;i < arguments.length;i++) {
		arguments[i].interactive = true;
	}
}