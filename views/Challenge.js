var px = require("../px");
var ui = require("../uiutil");
var sock = require("../sock");
var etgutil = require("../etgutil");
var options = require("../options");

function sendChallenge(foe) {
	var deck = sock.getDeck();
	if (etgutil.decklength(deck) < (sock.user ? 31 : 9)) {
		require("./Editor")();
		return;
	}
	var gameData = {};
	ui.parsepvpstats(gameData);
	if (sock.user) {
		gameData.f = foe;
		sock.userEmit("foewant", gameData);
	} else {
		gameData.deck = deck;
		gameData.room = foe;
		sock.emit("pvpwant", gameData);
	}
	sock.pvp = foe;
}

module.exports = function(pvp) {
	function makeChallenge(foe) {
		if (!foe) return;
		pvpInputs.forEach(function(x) { x.style.visibility = "hidden" });
		cancelButton.style.visibility = "visible";
		challengeLabel.text = "You have challenged " + foe;
		sendChallenge(options.foename);
	}
	function maybeCustomAi(e) {
		if (e.keyCode == 13) aiClick.call(this);
	}
	function aiClick() {
		if (!options.aideck) return;
		var deck = sock.getDeck();
		if (etgutil.decklength(deck) < 9 || etgutil.decklength(options.aideck) < 9) {
			require("./Editor")();
			return;
		}
		var gameData = { deck: options.aideck, urdeck: deck, seed: Math.random() * etgutil.MAX_INT, foename: "Custom", cardreward: "" };
		ui.parsepvpstats(gameData);
		ui.parseaistats(gameData);
		require("./Match")(gameData, true);
	}
	function maybeChallenge(e) {
		e.cancelBubble = true;
		if (e.keyCode == 13) makeChallenge(options.foename);
	}
	function exitClick() {
		if (sock.pvp) {
			if (sock.user) sock.userEmit("foecancel");
			else sock.emit("roomcancel", { room: sock.pvp });
			delete sock.pvp;
		}
		require("./MainMenu")();
	}
	function cancelClick() {
		pvpInputs.forEach(function(x) { x.style.visibility = "visible" });
		challengeLabel.text = "";
		cancelButton.style.visibility = "hidden";
		if (sock.pvp) {
			if (sock.user) sock.userEmit("foecancel");
			else sock.emit("roomcancel", { room: sock.pvp });
			delete sock.pvp;
		}
	}
	function labelText(text) {
		var text = px.domText(text);
		text.style.fontSize = "18px";
		text.style.color = "white";
		text.style.pointerEvents = "none";
		return text;
	}
	var foename = px.domInput("Challenge", "foename", true, maybeChallenge),
		pvphp = px.domInput("HP", "pvphp", true),
		pvpmark = px.domInput("Mark", "pvpmark", true),
		pvpdraw = px.domInput("Draw", "pvpdraw", true),
		pvpdeck = px.domInput("Deck", "pvpdeck", true),
		pvpButton = px.domButton("PvP", function() { makeChallenge(options.foename) }),
		cancelButton = px.domButton("Cancel", cancelClick);
	cancelButton.style.visibility = "hidden";
	var pvpInputs = [pvpButton,foename, pvphp, pvpmark, pvpdraw, pvpdeck];
	var aideck = px.domInput("AI Deck", "aideck", true, maybeCustomAi),
		aihp = px.domInput("HP", "aihp", true),
		aimark = px.domInput("Mark", "aimark", true),
		aidraw = px.domInput("Draw", "aidraw", true),
		aideckpower = px.domInput("Deck", "aideckpower", true);
	var challengeLabel = px.domText("");
	aideck.addEventListener("click", function() { this.setSelectionRange(0, 999) });
	var dom = [
		[190, 300, ["Exit", exitClick]],
		[190, 400, labelText("Own stats:")],
		[190, 425, pvphp],
		[190, 450, pvpmark],
		[190, 475, pvpdraw],
		[190, 500, pvpdeck]
	];
	if (pvp)
		dom.push(
		[110, 375, pvpButton],
		[110, 400, cancelButton],
		[190, 375, foename],
		[190, 375, challengeLabel]);
	else
		dom.push(
		[360, 375, ["Custom AI", aiClick]],
		[440, 375, aideck],
		[440, 400, labelText("AI's stats:")],
		[440, 425, aihp],
		[440, 450, aimark],
		[440, 475, aidraw],
		[440, 500, aideckpower]);
	px.view({ dom: dom });
}
module.exports.sendChallenge = sendChallenge;