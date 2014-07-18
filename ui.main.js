(function() {
var htmlElements = ["leftpane", "chatArea", "chatinput", "deckimport", "aideck", "foename", "change", "login", "password", "challenge", "chatBox", "trade", "bottompane", "demigodmode", "username"];
for (var i = 0;i < htmlElements.length;i++) {
	window[htmlElements[i]] = document.getElementById(htmlElements[i]);
}
if (localStorage){
	var store = [username];
	for (var i=0; i<store.length; i++){
		(function(storei){
			var field = storei.type == "checkbox" ? "checked" : "value";
			if (localStorage[storei.id] !== undefined){
				storei[field] = localStorage[storei.id];
			}
			storei.onchange = function(e){
				localStorage[storei.id] = field == "checked" && !storei[field] ? "" : storei[field];
			}
		})(store[i]);
	}
}
})();
var Cards, CardCodes, Targeting, game;
(function(){
var targetingMode, targetingModeCb, targetingText, discarding, user, renderer, endturnFunc, cancelFunc, accepthandfunc, foeDeck, player2summon, player2Cards, guestname, cardChosen, newCards;
var etgutil = require("./etgutil");
var etg = require("./etg");
var Actives = require("./Actives");
var Effect = require("./Effect");
var Quest = require("./Quest");
var evalGameState = require("./ai.eval");
var ui = require("./uiutil");
require("./etg.client").loadcards(function(cards, cardcodes, targeting) {
	Cards = cards;
	CardCodes = cardcodes;
	Targeting = targeting;
	console.log("Cards loaded");
});
function getTarget(src, active, cb) {
	var targetingFilter = Targeting[active.activename];
	if (targetingFilter) {
		targetingMode = function(t) { return (t instanceof etg.Player || t instanceof etg.CardInstance || t.owner == game.turn || t.passives.cloak || !t.owner.isCloaked()) && targetingFilter(src, t); }
		targetingModeCb = cb;
		targetingText = active.activename;
	} else {
		cb();
	}
}
function maybeSetText(obj, text) {
	if (obj.text != text) obj.setText(text);
}
function maybeSetTexture(obj, text) {
	if (text) {
		obj.visible = true;
		obj.setTexture(text);
	} else obj.visible = false;
}
function maybeSetButton(oldbutton, newbutton) {
	if (oldbutton)
		oldbutton.visible = false;
	if (newbutton)
		newbutton.visible = true;
}
function hitTest(obj, pos) {
	var x = obj.position.x - obj.width * obj.anchor.x, y = obj.position.y - obj.height * obj.anchor.y;
	return pos.x > x && pos.y > y && pos.x < x + obj.width && pos.y < y + obj.height;
}
function setInteractive() {
	for (var i = 0;i < arguments.length;i++) {
		arguments[i].interactive = true;
	}
}
function userEmit(x, data) {
	if (!data) data = {};
	data.u = user.name;
	data.a = user.auth;
	socket.emit(x, data);
}
function tgtToBits(x) {
	var bits;
	if (x == undefined) {
		return 0;
	} else if (x instanceof etg.Player) {
		bits = 1;
	} else if (x instanceof etg.Weapon) {
		bits = 17;
	} else if (x instanceof etg.Shield) {
		bits = 33;
	} else {
		bits = (x instanceof etg.Creature ? 2 : x instanceof etg.Permanent ? 4 : 5) | x.getIndex() << 4;
	}
	if (x.owner == game.player2) {
		bits |= 8;
	}
	return bits;
}
function bitsToTgt(x) {
	var tgtop = x & 7, player = game.players[x & 8 ? 0 : 1];
	if (tgtop == 0) {
		return undefined;
	} else if (tgtop == 1) {
		return player[["owner", "weapon", "shield"][x >> 4]];
	} else if (tgtop == 2) {
		return player.creatures[x >> 4];
	} else if (tgtop == 4) {
		return player.permanents[x >> 4];
	} else if (tgtop == 5) {
		return player.hand[x >> 4];
	} else console.log("Unknown tgtop: " + tgtop + ", " + x);
}
function refreshRenderer(stage, animCb) {
	if (realStage.children.length > 0){
		realStage.removeChildren();
	}
	realStage.addChild(stage);
	realStage.next = animCb;
}

var realStage = new PIXI.Stage(0x336699, true);
renderer = new PIXI.autoDetectRenderer(900, 600);
leftpane.appendChild(renderer.view);
var menuui, gameui;
var caimgcache = {}, crimgcache = {}, wsimgcache = {}, artcache = {}, artimagecache = {}, tximgcache = {};
var elecols = [0xa99683, 0xaa5999, 0x777777, 0x996633, 0x5f4930, 0x50a005, 0xcc6611, 0x205080, 0xa9a9a9, 0x337ddd, 0xccaa22, 0x333333, 0x77bbdd];

function lighten(c) {
	return ((c & 255) + 255 >> 1) | (((c >> 8) & 255) + 255 >> 1 << 8) | (((c >> 16) & 255) + 255 >> 1 << 16);
}
function maybeLighten(card){
	return card.upped ? lighten(elecols[card.element]) : elecols[card.element];
}
function getBack(ele, upped) {
	var offset = upped ? 13 : 0;
	return cardBacks ? cardBacks[ele + offset] : nopic;
}
function makeArt(card, art) {
	var rend = new PIXI.RenderTexture(132, 256);
	var template = new PIXI.Graphics();
	template.addChild(new PIXI.Sprite(getBack(card.element, card.upped)));
	var rarity = new PIXI.Sprite(ricons[card.rarity]);
	rarity.anchor.set(0, 1);
	rarity.position.set(5, 252);
	template.addChild(rarity);
	if (art) {
		var artspr = new PIXI.Sprite(art);
		artspr.position.set(2, 20);
		template.addChild(artspr);
	}
	var typemark = new PIXI.Sprite(ticons[card.type]);
	typemark.anchor.set(1, 1);
	typemark.position.set(128, 252);
	template.addChild(typemark);
	var nametag = new PIXI.Text(card.name, { font: "12px Dosis", fill: card.upped ? "black" : "white" });
	nametag.position.set(2, 4);
	template.addChild(nametag);
	if (card.cost) {
		var text = new PIXI.Text(card.cost, { font: "12px Dosis", fill: card.upped ? "black" : "white" });
		text.anchor.x = 1;
		text.position.set(rend.width - 20, 4);
		template.addChild(text);
		if (card.costele) {
			var eleicon = new PIXI.Sprite(eicons[card.costele]);
			eleicon.position.set(rend.width - 1, 10);
			eleicon.anchor.set(1, .5);
			eleicon.scale.set(.5, .5);
			template.addChild(eleicon);
		}
	}
	var infospr = new PIXI.Sprite(getTextImage(card.info(), ui.mkFont(11, card.upped ? "black" : "white"), "", rend.width-4))
	infospr.position.set(2, 150);
	template.addChild(infospr);
	rend.render(template);
	return rend;
}
function getArtImage(code, cb){
	if (artimagecache[code]){
		return cb(artimagecache[code]);
	}else {
		var loader = new PIXI.AssetLoader(["Cards/" + code + ".png"]);
		loader.onComplete = function() {
			return cb(artimagecache[code] = PIXI.Texture.fromImage("Cards/" + code + ".png"));
		}
		loader.load();
		return cb(artimagecache[code]);
	}
}
function getArt(code) {
	if (artcache[code]) return artcache[code];
	else {
		return getArtImage(code, function(art){
			return artcache[code] = makeArt(CardCodes[code], art);
		});
	}
}
function getCardImage(code) {
	if (caimgcache[code]) return caimgcache[code];
	else {
		var card = CardCodes[code];
		var rend = new PIXI.RenderTexture(100, 20);
		var graphics = new PIXI.Graphics();
		graphics.lineStyle(2, 0x222222, 1);
		graphics.beginFill(card ? maybeLighten(card) : code == "0" ? 0x887766 : 0x111111);
		graphics.drawRect(0, 0, 100, 20);
		graphics.endFill();
		if (card) {
			var clipwidth = 2;
			if (card.cost) {
				var text = new PIXI.Text(card.cost, { font: "11px Dosis", fill: card.upped ? "black" : "white" });
				text.anchor.x = 1;
				text.position.set(rend.width - 20, 5);
				graphics.addChild(text);
				clipwidth += text.width + 22;
				if (card.costele) {
					var eleicon = new PIXI.Sprite(eicons[card.costele]);
					eleicon.position.set(rend.width - 1, 10);
					eleicon.anchor.set(1, .5);
					eleicon.scale.set(.5, .5);
					graphics.addChild(eleicon);
				}
			}
			var text, loopi = 0;
			do text = new PIXI.Text(card.name.substring(0, card.name.length - (loopi++)), { font: "11px Dosis", fill: card.upped ? "black" : "white" }); while (text.width > rend.width - clipwidth);
			text.position.set(2, 5);
			graphics.addChild(text);
		}
		rend.render(graphics);
		caimgcache[code] = rend;
		return rend;
	}
}
function getCreatureImage(code) {
	if (crimgcache[code]) return crimgcache[code];
	else {
		return getArtImage(code, function(art){
			var card = CardCodes[code];
			var rend = new PIXI.RenderTexture(64, 82);
			var graphics = new PIXI.Graphics();
			var border = new PIXI.Sprite(cardBorders[card.element + (card.upped ? 13 : 0)]);
			border.scale.set(0.5, 0.5);
			graphics.addChild(border);
			graphics.beginFill(card ? maybeLighten(card) : elecols[0]);
			graphics.drawRect(0, 9, 64, 64);
			graphics.endFill();
			if (art) {
				art = new PIXI.Sprite(art);
				art.scale.set(0.5, 0.5);
				art.position.set(0, 9);
				graphics.addChild(art);
			}
			if (card) {
				var text = new PIXI.Text(card.name, { font: "8px Dosis", fill: card.upped ? "black" : "white" });
				text.anchor.x = 0.5;
				text.position.set(33, 72);
				graphics.addChild(text);
			}
			rend.render(graphics);
			crimgcache[code] = rend;
			return rend;
		});
	}
}
getPermanentImage = getCreatureImage; // Different name in case a makeover happens
function getWeaponShieldImage(code) {
	if (wsimgcache[code]) return wsimgcache[code];
	else {
		return getArtImage(code, function(art){
			var card = CardCodes[code];
			var rend = new PIXI.RenderTexture(80, 102);
			var graphics = new PIXI.Graphics();
			var border = (new PIXI.Sprite(cardBorders[card.element + (card.upped ? 13 : 0)]));
			border.scale.set(5/8, 5/8);
			graphics.addChild(border);
			graphics.beginFill(card ? maybeLighten(card) : elecols[0]);
			graphics.drawRect(0, 11, 80, 80);
			graphics.endFill();
			if (art) {
				art = new PIXI.Sprite(art);
				art.scale.set(5/8, 5/8);
				art.position.set(0, 11);
				graphics.addChild(art);
			}
			if (card) {
				var text = new PIXI.Text(card.name, { font: "10px Dosis", fill: card.upped ? "black" : "white" });
				text.anchor.x = 0.5;
				text.position.set(40, 91);
				graphics.addChild(text);
			}
			rend.render(graphics);
			wsimgcache[code] = rend;
			return rend;
		});
	}
}
function initTrade(data) {
	cardChosen = false;
	var editorui = new PIXI.DisplayObjectContainer();
	editorui.interactive = true;
	editorui.addChild(new PIXI.Sprite(backgrounds[0]));
	var cardminus = {};
	var btrade = makeButton(10, 40, "Trade");
	var bconfirm = makeButton(10, 70, "Confirm");
	var bconfirmed = new PIXI.Text("Confirmed!", { font: "16px Dosis" });
	var bcancel = makeButton(10, 10, "Exit");
	var selectedCards = [];
	var selectedCardsprites = [];
	var player2Cardsprites = [];
	player2Cards = [];
	var cardartcode;
	bcancel.click = function() {
		userEmit("canceltrade");
		startMenu();
	}
	btrade.click = function() {
		if (selectedCards.length > 0) {
			userEmit("cardchosen", { cards: selectedCards })
			console.log("Card sent");
			cardChosen = true;
			editorui.removeChild(btrade);
			editorui.addChild(bconfirm);
		}
		else
			chatArea.value = "You have to choose at least a card!"
	}
	bconfirm.click = function() {
		if (player2Cards.length > 0) {
			console.log("Confirmed!");
			userEmit("confirmtrade", { cards: selectedCards, oppcards: player2Cards });
			editorui.removeChild(bconfirm);
			editorui.addChild(bconfirmed);
		}
		else
			chatArea.value = "Wait for your friend to choose!"
	}
	bconfirmed.position.set(10, 110);
	setInteractive(btrade);
	editorui.addChild(btrade);
	editorui.addChild(bcancel);

	var cardpool = {};
	for (var i = 0;i < user.pool.length;i++) {
		if (user.pool[i] in cardpool) {
			cardpool[user.pool[i]]++;
		} else {
			cardpool[user.pool[i]] = 1;
		}
	}

	var cardsel = makeCardSelector(
		function(code){
			cardartcode = code;
		},
		function(code){
			var card = CardCodes[code];
			if (selectedCards.length < 30 && !isFreeCard(card) && code in cardpool && !(code in cardminus && cardminus[code] >= cardpool[code])) {
				adjust(cardminus, code, 1);
				for (var i = 0;i < selectedCards.length;i++) {
					var cmp = editorCardCmp(selectedCards[i], code);
					if (cmp >= 0) break;
				}
				selectedCards.splice(i, 0, code);
			}
		}
	);
	editorui.addChild(cardsel);
	for (var i = 0;i < 30;i++) {
		var sprite = new PIXI.Sprite(nopic);
		sprite.position.set(100 + Math.floor(i / 10) * 100, 8 + (i % 10) * 20);
		(function(_i) {
			sprite.click = function() {
				var card = CardCodes[selectedCards[_i]];
				adjust(cardminus, selectedCards[_i], -1);
				selectedCards.splice(_i, 1);
			}
			sprite.mouseover = function() {
				cardartcode = selectedCards[_i];
			}
		})(i);
		editorui.addChild(sprite);
		selectedCardsprites.push(sprite);
	}
	for (var i = 0;i < 30;i++) {
		var sprite = new PIXI.Sprite(nopic);
		sprite.position.set(450 + Math.floor(i / 10) * 100, 8 + (i % 10) * 20);
		(function(_i) {
			sprite.mouseover = function() {
				cardartcode = player2Cards[_i];
			}
		})(i);
		editorui.addChild(sprite);
		player2Cardsprites.push(sprite);
	}
	setInteractive.apply(null, selectedCardsprites);
	setInteractive.apply(null, player2Cardsprites);
	var cardArt = new PIXI.Sprite(nopic);
	cardArt.position.set(734, 8);
	editorui.addChild(cardArt);
	refreshRenderer(editorui, function() {
		cardsel.next(cardpool, cardminus);
		if (cardartcode) {
			cardArt.setTexture(getArt(cardartcode));
		}
		for (var i = 0;i < player2Cards.length;i++) {
			player2Cardsprites[i].visible = true;
			player2Cardsprites[i].setTexture(getCardImage(player2Cards[i]));
		}
		for (;i<30;i++)	{
			player2Cardsprites[i].visible = false;
		}
		for (var i = 0;i < selectedCards.length;i++) {
			selectedCardsprites[i].visible = true;
			selectedCardsprites[i].setTexture(getCardImage(selectedCards[i]));
		}
		for (;i<30;i++) {
			selectedCardsprites[i].visible = false;
		}
	});
}
function initLibrary(pool){
	console.log(pool);
	var editorui = new PIXI.DisplayObjectContainer(), cardartcode;
	editorui.interactive = true;
	editorui.addChild(new PIXI.Sprite(backgrounds[0]));
	var bexit = makeButton(10, 10, "Exit");
	bexit.click = startMenu;
	editorui.addChild(bexit);
	var cardminus = {}, cardpool = {};
	pool = etgutil.decodedeck(pool);
	for (var i = 0;i < pool.length;i++) {
		if (pool[i] in cardpool) {
			cardpool[pool[i]]++;
		} else {
			cardpool[pool[i]] = 1;
		}
	}
	var cardsel = makeCardSelector(
		function(code){
			cardartcode = code;
		}, null);
	editorui.addChild(cardsel);
	var cardArt = new PIXI.Sprite(nopic);
	cardArt.position.set(734, 8);
	editorui.addChild(cardArt);
	refreshRenderer(editorui, function(){
		cardsel.next(cardpool, cardminus);
		if (cardartcode) {
			cardArt.setTexture(getArt(cardartcode));
		}
	});
}
function initGame(data, ai) {
	game = new etg.Game(data.first, data.seed);
	if (data.hp) {
		game.player2.maxhp = game.player2.hp = data.hp;
	}
	if (data.aimarkpower) {
		game.player2.markpower = data.aimarkpower;
	}
	if (data.urhp) {
		game.player1.maxhp = game.player1.hp = data.urhp;
	}
	if (data.aidrawpower) {
	    game.player2.drawpower = data.aidrawpower;
	}
	if (data.demigod) {
	    game.player1.maxhp = game.player1.hp = 200;
	    game.player1.drawpower = 2;
	    data.urdeck = doubleDeck(data.urdeck);
	    game.player1.markpower = 3;
	}
	if (data.foedemigod) {
	    game.player2.maxhp = game.player2.hp = 200;
	    game.player2.drawpower = 2;
	    data.deck = doubleDeck(data.deck);
	    game.player2.markpower = 3;
	}
	var idx, code, decks = [data.urdeck, data.deck];
	for (var j = 0;j < 2;j++) {
		for (var i = 0;i < decks[j].length;i++) {
			if (CardCodes[code = decks[j][i]]) {
				game.players[j].deck.push(CardCodes[code]);
			} else if (~(idx = etg.TrueMarks.indexOf(code))) {
				game.players[j].mark = idx;
			}
		}
	}
	foeDeck = game.player2.deck.slice();
	game.turn.drawhand(7);
	game.turn.foe.drawhand(7);
	if (data.foename) game.foename = data.foename;
	if (ai) {
		game.player2.ai = ai;
		if (game.turn == game.player2) {
			game.progressMulligan();
		}
	}
	startMatch();
}
function getDeck(limit) {
	var deck = user ? user.decks[user.selectedDeck] : (deckimport.value || "").split(" ");
	if (limit && deck.length > 60){
		deck.length = 60;
	}
	return deck;
}
function aiEvalFunc() {
	var disableEffectsBack = Effect.disable;
	Effect.disable = true;
	var limit = 999;
	function mkcommand(cbits, tbits) {
		return ["cast", cbits | tbits << 9];
	}
	function iterLoop(n, commands, currentEval) {
		var log = n>=1?console.log.bind(console):function(){};
		function iterCore(c, active) {
			var cbits = tgtToBits(c) ^ 8;
			var candidates = [fullCandidates[0]];
			function evalIter(t, ignoret) {
				if ((ignoret || (t && targetingMode(t))) && limit > 0) {
					var tbits = tgtToBits(t) ^ 8;
					var gameBack = game, targetingModeBack = targetingMode, targetingModeCbBack = targetingModeCb;
					game = game.clone();
					limit--;
					var tone = bitsToTgt(tbits);
					bitsToTgt(cbits).useactive(tone);
					var cmdcopy = commands.slice();
					cmdcopy.push(mkcommand(cbits, tbits));
					var v = evalGameState(game);
					if (v < candidates[0]) {
						candidates = [v, cmdcopy];
						log("\t" + c + " " + (t || "-") + " " + v);
					}
					if (n) {
						var iterRet = iterLoop(n - 1, cmdcopy, v);
						if (iterRet[0] < candidates[0]) {
							candidates = iterRet;
						}
					}
					game = gameBack;
					targetingMode = targetingModeBack;
					targetingModeCb = targetingModeCbBack;
				}
			}
			getTarget(c, active || Actives.obsession, function(t) {
				if (!t) {
					evalIter(undefined, true);
				}
				targetingMode = null;
				if (candidates.length > 1) {
					var v = candidates[0], oldv = fullCandidates[0];
					if (v < oldv) {
						fullCandidates = candidates;
					}
				}
			});
			if (targetingMode) {
				log("in " + active.activename);
				for (var j = 0;j < 2;j++) {
					var pl = j == 0 ? c.owner : c.owner.foe;
					evalIter(pl);
					evalIter(pl.weapon);
					evalIter(pl.shield);
					for (var i = 0;i < 23;i++) {
						evalIter(pl.creatures[i]);
					}
					for (var i = 0;i < 16;i++) {
						evalIter(pl.permanents[i]);
					}
					for (var i = 0;i < pl.hand.length;i++) {
						evalIter(pl.hand[i]);
					}
				}
				log("out");
				targetingModeCb(1);
			}
		}
		if (currentEval === undefined) {
			currentEval = evalGameState(game);
		}
		var fullCandidates = [currentEval];
		var self = game.player2;
		var wp = self.weapon, sh = self.shield;
		if (wp && wp.canactive()) {
			iterCore(wp, wp.active.cast);
		}
		if (sh && sh.canactive()) {
			iterCore(sh, sh.active.cast);
		}
		for (var i = 0;i < 23;i++) {
			var cr = self.creatures[i];
			if (cr && cr.canactive()) {
				iterCore(cr, cr.active.cast);
			}
		}
		for (var i = 0;i < 16;i++) {
			var pr = self.permanents[i];
			if (pr && pr.canactive()) {
				iterCore(pr, pr.active.cast);
			}
		}
		var codecache = {};
		for (var i = self.hand.length - 1;i >= 0;i--) {
			var cardinst = self.hand[i];
			if (cardinst.canactive()) {
				if (!(cardinst.card.code in codecache)) {
					codecache[cardinst.card.code] = true;
					iterCore(cardinst, cardinst.card.type == etg.SpellEnum && cardinst.card.active);
				}
			}
		}
		return fullCandidates;
	}
	var cmd = iterLoop(1, [])[1];
	console.log("Leftover iters: " + limit);
	Effect.disable = disableEffectsBack;
	var self = game.player2;
	if (cmd) {
		return cmd[0];
	} else if (self.hand.length == 8) {
		var mincardvalue = 999, worstcards;
		for (var i = 0;i < 8;i++) {
			var cardinst = self.hand[i];
			var cardvalue = self.quanta[cardinst.card.element] - cardinst.card.cost;
			if (cardinst.card.type != etg.SpellEnum && cardinst.card.active && cardinst.card.active.discard == Actives.obsession) { cardvalue += 5; }
			if (cardvalue == mincardvalue) {
				worstcards.push(i);
			} else if (cardvalue < mincardvalue) {
				mincardvalue = cardvalue;
				worstcards = [i];
			}
		}
		return ["endturn", worstcards[Math.floor(Math.random() * worstcards.length)]];
	} else return ["endturn"];
}
function listify(maybeArray) {
	if (maybeArray instanceof Array) return maybeArray;
	else return maybeArray.split();
}
function count(haystack, needle){
	var c = 0, i=-1;
	for(;;){
		i = haystack.indexOf(needle, i+1);
		if (~i) c++;
		else return c;
	}
}
function victoryScreen() {
	var victoryui = new PIXI.DisplayObjectContainer();
	victoryui.interactive = true;
	var winner = game.winner == game.player1;
	//lobby background
	var bgvictory = new PIXI.Sprite(backgrounds[0]);
	victoryui.addChild(bgvictory);

	victoryui.addChild(makeText(10, 290, "Plies: " + game.ply + "\nTime: " + ((Date.now()-game.startTime)/1000).toFixed(1) + " seconds"));
	if (winner){
		var victoryText = game.quest ? game.wintext : "You won!";
		var tinfo = makeText(450, game.cardreward ? 130 : 250, victoryText);
		tinfo.anchor.x = 0.5;
		tinfo.anchor.y = 1;
		victoryui.addChild(tinfo);
	}

	var bexit = makeButton(412, 430, "Exit");
	bexit.click = function() {
		if (game.quest)
			startQuestArea(game.area);
		else
			startMenu();
		game = undefined;
	}
	victoryui.addChild(bexit);
	if (game.goldreward && winner) {
		var goldshown = (game.goldreward || 0) - (game.cost || 0);
		tgold = makeText(340, 550, "Gold won: $" + goldshown);
		victoryui.addChild(tgold);
		user.gold += game.goldreward;
		userEmit("addgold", { g: game.goldreward });
	}
	var rewards = [];
	if (game.cardreward && winner) {
		game.cardreward = listify(game.cardreward);
		for (var i = 0;i < game.cardreward.length;i++) {
			var cardArt = new PIXI.Sprite(nopic);
			cardArt.anchor.x = .5;
			cardArt.position.set(470-game.cardreward.length*20+i*40, 170);
			rewards.push(cardArt);
			victoryui.addChild(cardArt);
		}
		Array.prototype.push.apply(user.pool, game.cardreward);
		userEmit("addcards", { c: etgutil.encodedeck(game.cardreward) });
	}

	refreshRenderer(victoryui, function(){
		if (game.cardreward && winner){
			for(var i=0; i<game.cardreward.length; i++){
				rewards[i].setTexture(getArt(game.cardreward[i]));
			}
		}
	});
}

function doubleDeck(deck) {
	return deck.concat(deck);
}

function deckMorph(deck,MorphFrom,morphTo) {
	var deckout =[];
	for (var i =0; i < deck.length; i++) {
		var morphMatchInd = MorphFrom.indexOf(deck[i]);
		if (morphMatchInd > -1) {
			deckout.push(morphTo[morphMatchInd]);
		} else {
			deckout.push(deck[i]);
		}
	}
	return deckout;
}

function mkDemigod() {
	var urdeck = getDeck();
	if (urdeck.length < (user ? 31 : 11)) {
		startEditor();
		return;
	}
	if (user) {
		if (user.gold < 20) {
			chatArea.value = "Requires 20\u00A4";
			return;
		}
		user.gold -= 20;
		userEmit("subgold", { g: 20 });
	}

	var demigods = [
		["Akan", "7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7bu 7bu 7bu 7bu 7bu 7am 7am 7am 7dm 7dm 7dn 7dn 7do 7do 7n0 7n6 7n6 7n6 7n6 7n3 7n3 7n3 7n3 7n3 7n3 7nb 7n9 7n9 7n9 8pr"],
		["Anubis", "710 710 710 710 710 710 710 710 710 710 710 710 710 710 72i 72i 72i 72i 71l 71l 71l 71l 717 717 717 71b 71b 71b 711 711 7t7 7t7 7t7 7t7 7t7 7t7 7t9 7t9 7t9 7ti 7ti 7ti 7ti 7ta 7ta 8pt"],
		["Atomsk", "7ne 7ne 7ne 7ne 7n9 7n9 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t9 7t9 7t9 7tb 7tb 7ta 7ta 7ta 7td 7td 7td 7td 7t5 7t5 8pr"],
		["Gobannus", "7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7e0 7e0 7e0 7e0 7e0 7e0 7dv 7dv 7dv 7dv 7dv 7dv 7n2 7n2 7n2 7n2 7qb 7qb 7qb 7th 7th 7th 7th 7tb 7tb 7tb 7tb 7tb 7tb 7ta 7ta 8pt"],
		["Halwn", "710 710 710 710 710 710 710 710 710 710 710 72i 72i 72i 72i 71m 71m 71m 718 718 718 718 718 718 719 719 719 719 71b 71b 71b 71j 71j 71j 71j 7aj 7aj 7aj 7aj 8pn"],
		["Kenosis", "744 744 744 744 744 744 744 744 744 744 744 744 744 744 744 74f 74f 74f 74f 74f 74f 745 745 745 745 745 7k9 7k9 7k9 7k9 7k9 7k9 7jv 7jv 7jv 7jv 7jv 7k7 7k7 7k7 7k1 8pq"],
		["Lycaon", "6ts 6ts 6ts 6ts 6ts 6ts 6ts 6ts 6ts 6ts 6ve 6ve 6ve 6ve 6ve 6ve 6u2 6u2 6u2 6u2 6u2 6u2 6u1 6u1 6u1 6u1 6u1 6u1 6ud 6ud 6ud 6ud 6u7 6u7 6u7 6u7 7th 7th 7tj 7tj 7tj 7ta 7ta 8pt"],
		["Neysa", "7gk 7gk 7gk 7gk 7i6 7i6 7i6 7i6 7i6 7i6 7i6 7i6 7i6 7i6 7i6 7h6 7h6 7h6 7hb 7hb 7hb 7hb 7hb 7hb 7k6 7k6 7k6 7k6 7k5 7k5 7k5 7k5 7k5 7k5 7n2 7n2 7n2 7n2 7n2 8pq"],
		["Nirrti", "718 718 718 718 718 718 71a 71a 71a 71a 71a 7n2 7n2 7n2 7n2 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q4 7q4 7q4 7qf 7qf 7qf 7q5 7q5 7q5 7q5 7q5 7q5 7qg 7qg 7qg 7qg 8pk"],
		["Pele", "778 778 778 778 778 778 778 778 778 778 778 778 778 778 778 778 778 778 778 77g 77g 77g 77g 77g 77g 77q 77q 77h 77h 77h 77h 77h 77b 77b 77b 7q4 7q4 7q4 7ql 7ql 7ql 7ql 7ql 7q3 7q3 8ps"],
		["Suwako", "7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7bu 7bu 7bu 7bu 7bu 7bu 7ae 7ae 7ae 7ae 7ae 7ae 7al 7am 7am 7am 7as 7as 7as 7as 80d 80d 80d 80d 80i 80i 80i 8pu"],
		["Thetis", "7an 7an 7an 7an 7ap 7ap 7ap 7ap 7aj 7aj 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7h4 7h4 7h4 7h4 7h4 7gq 7gq 7gq 7h1 7h1 7h1 7gr 7gr 7gr 7gu 7gu 7gu 7gu 7gu 7gu 8pn"],
	];

	var demigod = demigods[Math.floor(Math.random() * demigods.length)];
	var dgname = "Demigod\n" + demigod[0];
	var deck = (!user && aideck.value) || demigod[1];
	deck = (deck + " " + deck).split(" ");
	initGame({ first: Math.random() < .5, deck: deck, urdeck: urdeck, seed: Math.random() * etgutil.MAX_INT, hp: 200, aimarkpower: 3, aidrawpower: 2, foename: dgname }, aiEvalFunc);
	game.cost = 20;
	game.level = 3;
}
function mkMage() {
	var urdeck = getDeck();
	if (urdeck.length < (user ? 31 : 11)) {
		startEditor();
		return;
	}
	if (user) {
		if (user.gold < 5) {
			chatArea.value = "Requires 5\u00A4";
			return;
		}
		user.gold -= 5;
		userEmit("subgold", { g: 5 });
	}
	var mages = [
		["The Wall", "5de 5de 5de 5de 5de 5de 5de 5de 5de 5de 5de 5de 5de 5de 5c5 5c2 5c2 5c2 5c2 5c8 5c8 5c8 5c8 5ci 5c3 5l8 5l8 5mq 5mq 5lo 5lo 5lm 5lm 5lm 5lm 5ln 5ln 5la 5la 5li 8pq"],
		["The Horde", "5bs 5bs 5bs 5bs 5bs 5bs 5bs 5bs 5bs 5de 5de 5de 5de 5de 5de 5de 5de 5cb 5cb 5cb 5cb 5ce 5c6 5c6 5c6 5c6 5c9 5c9 5ca 5ca 5cr 5cr 5cr 5cr 8pn"],
		["The Weaponsmith", "4t4 4t4 4t4 4t4 4tc 4tc 4td 4td 4td 4td 5c7 5c7 5c7 5c7 5c4 5gi 5gi 5gi 5gi 5gi 5gi 5gi 5gi 5gi 5gi 5gi 5gi 5gi 5gi 5ff 5ff 5ff 5ff 5fh 5fh 5fh 5fh 5f6 5f6 5f8 8pn"],
		["The Swarm", "55q 55q 564 564 564 564 560 566 566 5t2 5t2 5t2 5t2 5t2 5t2 5t2 5t2 5t2 5t2 5t2 5t2 5t2 5t2 5rk 5rk 5rk 5rk 5rq 5rq 5rq 5rq 5rq 5rq 5rs 8pl"],
		["The Mirror", "4sa 4sa 4sa 4sa 4sa 4sa 4sa 4sa 4sa 4sa 4sa 4sa 4sa 4sa 4sa 502 502 535 55v 599 599 599 5cc 5fc 5in 5lq 5lq 5os 5rl 5vb 5vb 623 623 623 623 8pu"],
		["The Waves", "58o 58o 58o 58o 58o 58o 58o 58o 598 598 598 593 58s 5i4 5i4 5i4 5i4 5i4 5i4 5i4 5i4 5i4 5i4 5i4 5i4 5i6 5i6 5i6 5i6 5ib 5ic 5ig 5ig 5ig 5ig 8pm"],
		["The Eater", "576 576 576 576 576 576 576 576 576 576 576 576 576 576 563 563 55p 55p 55r 55r 55r 55r 58t 58t 58t 58t 58q 58q 58v 591 591 591 8pm"],
		["The Ashes", "5f0 5f0 5f0 5f0 5f0 5f0 5f0 5f0 5gi 5gi 5gi 5gi 5gi 5gi 5gi 5gi 5f4 5f4 5f4 5f4 5f6 5f6 5f6 5f6 5f7 5fb 5fb 5fb 5fb 5fg 5f8 5f8 5fc 5fc 5fc 5fc 5fe 8po"],
		["The Gale", "5lb 5lb 5lb 5lb 5lf 5lf 5lf 5lf 5lh 5oc 5oc 5oc 5oc 5oc 5oc 5pu 5pu 5pu 5pu 5pu 5pu 5pu 5pu 5pu 5pu 5oe 5oe 5oe 5oe 5ol 5or 5or 5op 8pq"],
		["The Clock", "5rg 5rg 5rg 5rg 5rg 5rg 5rg 5rg 5rg 5rg 5t2 5t2 5t2 5t2 5t2 5t2 5t2 5t2 5t2 5t2 5rk 5rk 5rk 5rk 5s1 5rl 5rl 5rl 5rl 5ro 5ru 5ru 5ru 5ru 5s0 5s0 5s0 5s0 5rm 5rm 8ps"],
		["The Contagion", "52g 52g 52g 52g 52g 52g 542 542 542 542 542 542 52o 52o 52o 52o 52q 52u 52u 52u 52u 52p 52p 52r 52r 5un 5un 5un 5un 5uq 5uq 5uq 5uq 8pt"],
		["The Uncertainty", "50u 50u 50u 50u 50u 50u 50u 50u 50u 50u 50u 50u 50u 50u 50u 50u 50u 4vi 4vi 4vi 4vi 4vk 4vk 4vk 4vk 4vl 4vs 4vs 4vs 4vs 4vt 501 501 8pi"],
		["The Weight", "55k 55k 55k 55k 55k 55k 55k 55k 576 576 576 576 576 576 576 576 55t 55t 561 561 561 562 562 562 562 55p 55m 55m 55m 55m 55s 565 565 55o 55o 8pl"],
		["The Ethereal", "61o 61o 61o 61o 61o 61o 61o 61o 63a 63a 63a 63a 63a 63a 63a 63a 61q 61q 61u 620 620 620 620 625 625 625 625 627 627 627 627 61t 61t 61t 61t 622 8pu"],
		["The Vacuum", "5uk 5uk 5uk 5uk 5uk 5uk 606 606 606 606 606 606 5ur 5us 5us 5us 5us 5v3 5v3 5v3 5v3 5uq 5uq 5ut 5ut 5ut 5ut 5up 5up 5uo 8pt"],
		["The Chromatic", "4sa 4sa 4sa 4sa 4sc 4sc 4sc 4sc 4vj 4vj 4vj 4vj 4vj 4vj 4vh 4vk 52i 532 55u 563 599 598 5cc 5fi 5iq 5il 5lp 5os 5ri 5un 627 8pi"],
		["The Pyre", "5f0 5f0 5f0 5f0 5f0 5f0 5f0 5f0 5f0 5f0 5f1 5f1 5f1 5f1 5f3 5f3 5f3 5f3 5f9 5f9 5f9 5f9 5f9 5f9 5f4 5f4 5f4 5f4 5fa 5fa 5fa 5fa 5l9 5l9 5l9 5l9 8pm"],
		["The Dead", "4vq 4vq 4vq 4vq 52g 52g 52g 52g 52g 52g 52g 52g 52v 52v 52v 52v 52v 52v 52k 52k 52n 52n 52n 52n 531 531 531 531 52p 52p 52r 52r 8pj"],
	];

	var mage = mages[Math.floor(Math.random() * mages.length)];
	var deck = ((!user && aideck.value) || mage[1]).split(" ");
	initGame({ first: Math.random() < .5, deck: deck, urdeck: urdeck, seed: Math.random() * etgutil.MAX_INT, hp: 125, foename: mage[0] }, aiEvalFunc);
	game.cost = 5;
	game.level = 1;
}
function mkQuestAi(questname, stage, area) {
	var quest = Quest[questname][stage];
	if (!quest)
		return;
	var deck = quest.deck.split(" ");
	var foename = quest.name || "";
	var markpower = quest.markpower || 1;
	var drawpower = quest.drawpower || 1;
	if (quest.doubledeck) deck = doubleDeck(deck);
	var hp = quest.hp || 100;
	var playerHPstart = quest.urhp || 100;
	var urdeck = getDeck();
	if (quest.morph) {
		if (quest.morph.to.length != quest.morph.from.length) {
			console.log("Warning: morphFrom is not the same length as morphTo. Aborting player deck morph for stage", stage);
		} else {
			urdeck = deckMorph(urdeck, quest.morph.from.split(" "), quest.morph.to.split(" "));
		}
	}
	if (urdeck.length < (user ? 31 : 11)) {
		/*startEditor();*/
		return "ERROR: Your deck is invalid or missing! Please exit and create a valid deck in the deck editor.";
	}
	initGame({ first: Math.random() < .5, deck: deck, urdeck: urdeck, seed: Math.random() * etgutil.MAX_INT, hp: hp, aimarkpower: markpower, foename: foename, urhp : playerHPstart, aidrawpower:drawpower }, aiEvalFunc);
	game.quest = [questname, stage];
	game.wintext = quest.wintext || "";
	game.autonext = quest.autonext || false;
	game.area = area;
	if ((user.quest[questname] <= stage || !(questname in user.quest))) game.cardreward = quest.cardreward;
}
function mkAi(level) {
	return function() {
		var uprate = level == 0 ? 0 : level == 1 ? .1 : .3;
		var gameprice = level == 0 ? 0 : level == 1 ? 5 : 10;
		function upCode(x) {
			return CardCodes[x].asUpped(Math.random() < uprate).code;
		}
		if (Cards) {
			var urdeck = getDeck();
			if (urdeck.length < (user ? 31 : 11)) {
				startEditor();
				return;
			}
			var deck;
			if (!user && aideck.value) {
				deck = aideck.value.split(" ");
			} else {
				if (user) {
					if (gameprice) {
						if (user.gold < gameprice) {
							chatArea.value = "Requires " + gameprice + "\u00A4";
							return;
						}
						user.gold -= gameprice;
						userEmit("subgold", { g: gameprice });
					}
				}
				var cardcount = {};
				var eles = [Math.ceil(Math.random() * 12), Math.ceil(Math.random() * 12)], ecost = [];
				var pillars = etg.filtercards(false, function(x) { return x.type == etg.PillarEnum && !x.rarity; });
				for (var i = 0;i < 13;i++) {
					ecost[i] = 0;
				}
				deck = [];
				var anyshield = 0, anyweapon = 0;
				for (var j = 0;j < 2;j++) {
					for (var i = 0;i < (j == 0 ? 20 : 10) ;i++) {
						var maxRarity = level == 0 ? 2 : (level == 1 ? 3 : 4);
						var card = etg.PlayerRng.randomcard(Math.random() < uprate, function(x) { return x.element == eles[j] && x.type != etg.PillarEnum && x.rarity <= maxRarity && cardcount[x.code] != 6 && !(x.type == etg.ShieldEnum && anyshield == 3) && !(x.type == etg.WeaponEnum && anyweapon == 3); });
						deck.push(card.code);
						cardcount[card.code] = (cardcount[card.code] || 0) + 1;
						if (!(((card.type == etg.WeaponEnum && !anyweapon) || (card.type == etg.ShieldEnum && !anyshield)) && cardcount[card.code])) {
							ecost[card.costele] += card.cost;
						}
						if (card.cast) {
							ecost[card.castele] += card.cast * 1.5;
						}
						if (card == Cards.Nova || card == Cards.SuperNova) {
							for (var k = 1;k < 13;k++) {
								ecost[k]--;
							}
						} else if (card.type == etg.ShieldEnum) anyshield++;
						else if (card.type == etg.WeaponEnum) anyweapon++;
					}
				}
				if (!anyshield) {
					var card = CardCodes[deck[0]];
					ecost[card.costele] -= card.cost;
					deck[0] = Cards.Shield.asUpped(Math.random() < uprate).code;
				}
				if (!anyweapon) {
					var card = CardCodes[deck[1]];
					ecost[card.costele] -= card.cost;
					deck[1] = (eles[1] == etg.Air || eles[1] == etg.Light ? Cards.ShortBow :
                        eles[1] == etg.Gravity || eles[1] == etg.Earth ? Cards.Hammer :
                        eles[1] == etg.Water || eles[1] == etg.Life ? Cards.Wand :
                        eles[1] == etg.Darkness || eles[1] == etg.Death ? Cards.Dagger :
						eles[1] == etg.Entropy || eles[1] == etg.Aether ? Cards.Disc :
                        Cards.ShortSword).asUpped(Math.random() < uprate).code;
				}
				var pillarstart = deck.length, qpe = 0, qpemin = 99;
				for (var i = 1;i < 13;i++) {
					if (!ecost[i]) continue;
					qpe++;
					qpemin = Math.min(qpemin, ecost[i]);
				}
				if (qpe >= 4) {
					for (var i = 0;i < qpemin * .8;i++) {
						deck.push(upCode(Cards.QuantumPillar.code));
						qpe++;
					}
				} else qpemin = 0;
				for (var i = 1;i < 13;i++) {
					if (!ecost[i]) continue;
					for (var j = 0;j < Math.round((ecost[i] - qpemin) / 5) ;j++) {
						deck.push(upCode(pillars[i * 2]));
					}
				}
				deck.push(etg.TrueMarks[eles[1]]);
				chatArea.value = deck.join(" ");
			}

			var randomNames = [
				"Adrienne", "Audrie",
				"Billie", "Brendon",
				"Dane", "Digna",
				"Emory",
				"Garland",
				"Margie", "Mariah", "Martina", "Monroe", "Murray",
				"Page",
				"Rocky", "Ronald",
				"Seth", "Sherman", "Stormy",
				"Tammi",
				"Yuriko"
			];

			var typeName = ["Commoner", "Mage", "Champion"];

			var foename = typeName[level] + "\n" + randomNames[Math.floor(Math.random() * randomNames.length)];
			if (level == 2) deck = doubleDeck(deck);
			initGame({ first: Math.random() < .5, deck: deck, urdeck: urdeck, seed: Math.random() * etgutil.MAX_INT, hp: level == 0 ? 100 : level == 1 ? 125 : 150, aimarkpower: level == 2 ? 2 : 1, foename: foename, aidrawpower: level == 2 ? 2 : 1 }, aiEvalFunc);
			game.cost = gameprice;
			game.level = level;
		}
	}
}

// Asset Loading
var nopic, goldtex, buttex;
var backgrounds = ["assets/bg_default.png", "assets/bg_lobby.png", "assets/bg_shop.png", "assets/bg_quest.png", "assets/bg_game.png", "assets/bg_questmap.png"];
var questIcons = [], eicons = [], ricons = [], cardBacks = [], cardBorders = [], boosters = [], popups = [], sicons = [], ticons = [], sborders = [];
var mapareas = {};
var preLoader = new PIXI.AssetLoader(["assets/null.png", "assets/gold.png", "assets/button.png", "assets/questIcons.png", "assets/esheet.png", "assets/raritysheet.png", "assets/backsheet.png",
	"assets/cardborders.png", "assets/boosters.png", "assets/popup_booster.png", "assets/statussheet.png", "assets/statusborders.png", "assets/typesheet.png"].concat(backgrounds));
var loadingBarProgress = 0, loadingBarGraphic = new PIXI.Graphics();
preLoader.onProgress = function() {
	loadingBarGraphic.clear();
	loadingBarGraphic.beginFill(0xFFFFFF);
	loadingBarGraphic.drawRect(0, 284, 900*(1-this.loadCount/this.assetURLs.length), 32);
	loadingBarGraphic.endFill();
}
preLoader.onComplete = function() {
	nopic = PIXI.Texture.fromFrame("assets/null.png");
	goldtex = PIXI.Texture.fromFrame("assets/gold.png");
	buttex = PIXI.Texture.fromFrame("assets/button.png");
	var tex = PIXI.Texture.fromFrame("assets/questIcons.png");
	for (var i = 0;i < 2;i++) {
		questIcons.push(new PIXI.Texture(tex, new PIXI.Rectangle(i * 32, 0, 32, 32)));
	}
	for (var i = 0;i < backgrounds.length;i++){
		backgrounds[i] = PIXI.Texture.fromFrame(backgrounds[i]);
	}
	var tex = PIXI.Texture.fromFrame("assets/esheet.png");
	for (var i = 0;i < 13;i++) eicons.push(new PIXI.Texture(tex, new PIXI.Rectangle(i * 32, 0, 32, 32)));
	var tex = PIXI.Texture.fromFrame("assets/raritysheet.png");
	for (var i = 0;i < 6;i++) ricons.push(new PIXI.Texture(tex, new PIXI.Rectangle(i * 25, 0, 25, 25)));
	var tex = PIXI.Texture.fromFrame("assets/backsheet.png");
	for (var i = 0;i < 26;i++) cardBacks.push(new PIXI.Texture(tex, new PIXI.Rectangle(i * 132, 0, 132, 256)));
	var tex = PIXI.Texture.fromFrame("assets/cardborders.png");
	for (var i = 0;i < 26;i++) cardBorders.push(new PIXI.Texture(tex, new PIXI.Rectangle(i * 128, 0, 128, 162)));
	var tex = PIXI.Texture.fromFrame("assets/boosters.png");
	for (var i = 0;i < 4;i++) boosters.push(new PIXI.Texture(tex, new PIXI.Rectangle(i * 100, 0, 100, 150)));
	popups.push(PIXI.Texture.fromFrame("assets/popup_booster.png"));
	var tex = PIXI.Texture.fromFrame("assets/statussheet.png");
	for (var i = 0;i < 7;i++) sicons.push(new PIXI.Texture(tex, new PIXI.Rectangle(13 * i, 0, 13, 13)));
	var tex = PIXI.Texture.fromFrame("assets/statusborders.png");
	for (var i = 0;i < 3;i++) sborders.push(new PIXI.Texture(tex, new PIXI.Rectangle(64 * i, 0, 64, 81)));
	var tex = PIXI.Texture.fromFrame("assets/typesheet.png");
	for (var i = 0;i < 6;i++) ticons.push(new PIXI.Texture(tex, new PIXI.Rectangle(25 * i, 0, 25, 25)));
	startMenu();
}
refreshRenderer(loadingBarGraphic);
preLoader.load();
requestAnimate();
function makeButton(x, y, img, mouseoverfunc) {
	var b;
	if (typeof img == "string"){
		b = new PIXI.Sprite(buttex);
		var txt = new PIXI.Text(img, {font: "14px Dosis"});
		txt.anchor.set(.5, .5);
		txt.position.set(b.width/2, b.height/2);
		if (txt.width>b.width-6) txt.width=b.width-6;
		b.addChild(txt);
	}else{
		b = new PIXI.Sprite(img);
	}
	b.interactive = true;
	b.buttonMode = true;
	b.position.set(x, y);
	b.mousedown = function() {
		b.tint = 0x666666;
	}
	b.mouseover = b.mouseup = function() {
		if (mouseoverfunc) mouseoverfunc();
		b.tint = 0xAAAAAA;
	}
	b.mouseout = function() {
		b.tint = 0xFFFFFF;
	}
	return b;
}

function makeText(x, y, txt, vis) {
	var t = new PIXI.Sprite(getTextImage(txt, { font: "14px Verdana", fill: "white", stroke: "black", strokeThickness: 2 }));
	t.position.set(x, y);
	t.visible = vis === undefined || vis;
	t.setText = function(x){
		if (x){
			t.setTexture(getTextImage(x, { font: "14px Verdana", fill: "white", stroke: "black", strokeThickness: 2 }));
			t.visible = true;
		}else{
			t.visible = false;
		}
	}
	return t;
}

function toggleB() {
	for (var i = 0;i < arguments.length;i++) {
		arguments[i].visible = !arguments[i].visible;
		arguments[i].interactive = !arguments[i].interactive;
		arguments[i].buttonMode = !arguments[i].buttonMode;
	}
}
function isFreeCard(card) {
	return card.type == etg.PillarEnum && !card.upped && !card.rarity;
}
function editorCardCmp(x, y) {
	var cardx = CardCodes[x], cardy = CardCodes[y];
	return cardx.upped - cardy.upped || cardx.element - cardy.element || cardx.cost - cardy.cost || (x > y) - (x < y);
}
function adjust(cardminus, code, x) {
	if (code in cardminus) {
		cardminus[code] += x;
	} else cardminus[code] = x;
}
function makeCardSelector(cardmouseover, cardclick){
	var poolcache;
	var cardsel = new PIXI.DisplayObjectContainer();
	cardsel.interactive = true;
	var elefilter = 0, rarefilter = 0;
	var columns = [[],[],[],[],[],[]], columnspr = [[],[],[],[],[],[]];
	for (var i = 0;i < 13;i++) {
		var sprite = makeButton(8, 184 + i * 32, eicons[i]);
		sprite.interactive = true;
		(function(_i) {
			sprite.click = function() {
				elefilter = _i;
				makeColumns();
			}
		})(i);
		cardsel.addChild(sprite);
	}
	for (var i = 0;i < 6; i++){
		var sprite = makeButton(40, 188 + i * 32, ricons[i]);
		sprite.interactive = true;
		(function(_i) {
			sprite.click = function() {
				rarefilter = _i;
				makeColumns();
			}
		})(i);
		cardsel.addChild(sprite);
	}
	for (var i = 0;i < 6;i++) {
		for (var j = 0;j < 15;j++) {
			var sprite = new PIXI.Sprite(nopic);
			sprite.position.set(100 + i * 130, 272 + j * 20);
			var sprcount = new PIXI.Text("", { font: "12px Dosis" });
			sprcount.position.set(102, 4);
			sprite.addChild(sprcount);
			(function(_i, _j) {
				if (cardclick){
					sprite.click = function() {
						cardclick(columns[_i][_j]);
					}
				}
				if (cardmouseover){
					sprite.mouseover = function(){
						cardmouseover(columns[_i][_j]);
					}
				}
			})(i, j);
			sprite.interactive = true;
			cardsel.addChild(sprite);
			columnspr[i].push(sprite);
		}
	}
	function makeColumns(){
		for (var i = 0;i < 6;i++) {
			columns[i] = etg.filtercards(i > 2,
				function(x) { return x.element == elefilter &&
					((i % 3 == 0 && x.type == etg.CreatureEnum) || (i % 3 == 1 && x.type <= etg.PermanentEnum) || (i % 3 == 2 && x.type == etg.SpellEnum)) &&
					(!user || x in poolcache || isFreeCard(x)) && (!rarefilter || rarefilter == x.rarity);
				}, editorCardCmp);
		}
	}
	cardsel.next = function(cardpool, cardminus){
		var needToMakeCols = poolcache != cardpool;
		poolcache = cardpool;
		if (needToMakeCols){
			makeColumns();
		}
		for (var i = 0;i < 6;i++) {
			for (var j = 0;j < columns[i].length;j++) {
				var spr = columnspr[i][j], code = columns[i][j], card = CardCodes[code];
				spr.setTexture(getCardImage(code));
				spr.visible = true;
				if (user) {
					var txt = spr.getChildAt(0), card = CardCodes[code], inf = isFreeCard(card);
					if ((txt.visible = inf || code in cardpool)) {
						maybeSetText(txt, inf ? "-" : (cardpool[code] - (code in cardminus ? cardminus[code] : 0)).toString());
					}
				}
			}
			for (;j < 15;j++) {
				columnspr[i][j].visible = false;
			}
		}
	};
	return cardsel;
}
function startMenu() {
	menuui = new PIXI.DisplayObjectContainer();
	menuui.interactive = true;
	var buttonList = [];
	var mouseroverButton;
	var clickedButton;
	//lobby background
	var bglobby = new PIXI.Sprite(backgrounds[1]);
	bglobby.interactive = true;
	bglobby.hitArea = new PIXI.Rectangle(0, 0, 900, 670);
	bglobby.mouseover = function() {
		tinfo.setText("");
		tcost.setText("");
	}
	menuui.addChild(bglobby);

	//gold text
	var tgold = makeText(750, 101, (user ? "$" + user.gold : "Sandbox"));
	menuui.addChild(tgold);

	var taiwinloss = makeText(750, 125, (user ? "AI w/l:\n" + user.aiwins + "/" + user.ailosses + "\nPVP w/l:\n" + user.pvpwins + "/" + user.pvplosses : ""));
	menuui.addChild(taiwinloss);

	//info text
	var tinfo = makeText(50, 26, "")
	menuui.addChild(tinfo);

	//cost text
	var tcost = makeText(50, 51, "");
	menuui.addChild(tcost);

	//ai0 button
	var bai0 = makeButton(50, 100, "Commoner", function() {
		tinfo.setText("Commoners have no upgraded cards.");
		tcost.setText("Cost: $0");
	});
	bai0.click = mkAi(0);
	menuui.addChild(bai0);

	//ai1 button
	var bai1 = makeButton(150, 100, "Mage", function() {
		tinfo.setText("Mages have a few upgraded cards.");
		tcost.setText("Cost: $5");
	});
	bai1.click = mkMage;
	menuui.addChild(bai1);

	//ai2 button
	var bai2 = makeButton(250, 100, "Champion", function() {
		tinfo.setText("Champions have some upgraded cards.");
		tcost.setText("Cost: $10");
	});
	bai2.click = mkAi(2);
	menuui.addChild(bai2);

	//ai3 button
	var bai3 = makeButton(350, 100, "Demigod", function() {
		tinfo.setText("Demigods are extremely powerful. Come prepared for anything.");
		tcost.setText("Cost: $20");
	});
	bai3.click = mkDemigod;
	menuui.addChild(bai3);

	//Quests button
	var bquest = makeButton(50, 145, "Quests", function() {
		tinfo.setText("Go on an adventure!");
	});
	bquest.click = startQuestWindow;
	menuui.addChild(bquest);

	//ai arena button
	var baia = makeButton(50, 200, "Arena AI", function() {
		tinfo.setText("In the arena you will face decks from other players.");
		tcost.setText("Cost: $10");
	});
	baia.click = function() {
		if (Cards) {
			if (getDeck().length < 31) {
				startEditor();
				return;
			}

			if (user.gold < 10) {
				chatArea.value = "Requires 10g";
				return;
			}

			user.gold -= 10;
			userEmit("subgold", { g: 10 });
			userEmit("foearena");
		}
	}
	menuui.addChild(baia);

	//arena info button
	var binfoa = makeButton(50, 245, "Arena Info", function() {
		tinfo.setText("Check how your arena deck is doing.")
		tcost.setText("");
	});
	binfoa.click = function() {
		if (Cards) {
			userEmit("arenainfo");
		}
	}
	menuui.addChild(binfoa);

	//arena top10 button
	var btopa = makeButton(150, 245, "Arena T20", function() {
		tinfo.setText("Here you can see who the top players in arena are right now.")
		tcost.setText("");
	});
	btopa.click = function() {
		if (Cards) {
			userEmit("arenatop");
		}
	}
	menuui.addChild(btopa);

	//edit button
	var bedit = makeButton(50, 300, "Editor", function() {
		tinfo.setText("Here you can edit your deck, as well as submit an arena deck.");
		tcost.setText("");
	});
	bedit.click = startEditor;
	menuui.addChild(bedit);

	var bshop = makeButton(150, 300, "Shop", function() {
		tinfo.setText("Here you can buy booster packs which contains cards from the elements you choose.");
		tcost.setText("");
	});
	bshop.click = startStore;
	menuui.addChild(bshop);

	//upgrade button
	var bupgrade = makeButton(250, 300, "Sell/Upgrade", function() {
		tinfo.setText("Here you can upgrade or sell your cards.");
		tcost.setText("");
	});
	bupgrade.click = upgradestore;
	menuui.addChild(bupgrade);

	//logout button
	var blogout = makeButton(750, 246, "Logout", function() {
		tinfo.setText("Click here if you want to log out.")
		tcost.setText("");
	});
	blogout.click = function() {
		userEmit("logout");
		logout();
	}
	menuui.addChild(blogout);

	//delete account button
	var bdelete = makeButton(750, 550, "Wipe Account", function() {
		tinfo.setText("Click here if you want to remove your account.")
		tcost.setText("");
	});
	bdelete.click = function() {
		if (foename.value == user.name) {
			userEmit("delete");
			logout();
		} else {
			chatArea.value = "Input '" + user.name + "' into Challenge to delete your account";
		}
	}
	menuui.addChild(bdelete);

	if (!user) toggleB(baia, bshop, bupgrade, binfoa, btopa, blogout, bdelete, bquest, taiwinloss);

	//only display if user is logged in
	if (user && user.oracle) {
		cardcode = user.oracle;
		delete user.oracle;
		var oracle = new PIXI.Sprite(nopic);
		oracle.position.set(450, 100);
		menuui.addChild(oracle);
	}

	function logout() {
		user = undefined;

		toggleB(baia, bshop, bupgrade, binfoa, btopa, blogout, bdelete, bquest, taiwinloss);

		tgold.setText("Sandbox");
		tgold.position.set(755, 101);

		if (oracle) {
			menuui.removeChild(oracle);
		}
	}

	refreshRenderer(menuui, function() {
		if (user) {
			if (oracle) {
				oracle.setTexture(getArt(cardcode));
			}
			tgold.setText("$" + user.gold)
		}
	});
}
function startRewardWindow(reward) {
	var rewardList;
	if (reward == "mark") rewardList = etg.filtercards(false, function(x) { return x.rarity == 5 });
	else if (reward == "shard") rewardList = etg.filtercards(false, function(x) { return x.rarity == 4 });
	else rewardList = [];
	var rewardui = new PIXI.DisplayObjectContainer();
	rewardui.interactive = true;
	rewardui.addChild(new PIXI.Sprite(backgrounds[0]));

	var exitButton = makeButton(10, 10, "Exit");
	exitButton.click = startMenu;
	rewardui.addChild(exitButton);

	var confirmButton = makeButton(10, 40, "Done");
	confirmButton.click = function() {
		if (chosenReward)
			userEmit("codesubmit2", { code: foename.value, card: chosenReward });
	}

	rewardui.addChild(confirmButton);

	var chosenRewardImage = new PIXI.Sprite(nopic);
	chosenRewardImage.position.set(250, 20)
	rewardui.addChild(chosenRewardImage);
	var chosenReward = null;
	for (var i = 0; i < rewardList.length; i++) {
		var card = new PIXI.Sprite(getCardImage(rewardList[i]));
		card.position.set(100 + Math.floor(i/12) * 130, 272 + (i%12) * 20);
		(function(_i){
			card.click = function(){
				chosenReward = rewardList[_i]
			}
		})(i);
		rewardui.addChild(card);
		setInteractive(card);
	}

	refreshRenderer(rewardui, function() {
		if (chosenReward)
			chosenRewardImage.setTexture(getArt(chosenReward))
	});
}

function startQuest(questname) {
	if (!user.quest[questname] && user.quest[questname] != 0) {
		user.quest[questname] = 0;
		userEmit("updatequest", { quest: questname, newstage: 0 });
	}
}
function startQuestWindow(){
	var questui = new PIXI.DisplayObjectContainer();
	questui.interactive = true;
	var bgquest = new PIXI.Sprite(backgrounds[5]);
	bgquest.mouseover = function(){
		tinfo.setText("");
	};
	bgquest.interactive = true;
	questui.addChild(bgquest);
	var tinfo = makeText(32, 32, "");
	questui.addChild(tinfo);
	var bexit = makeButton(750, 246, "Exit");
	bexit.click = startMenu;
	questui.addChild(bexit);
	var areainfo = {
		forest: ["Spooky Forest", new PIXI.Polygon(555, 221, 456, 307, 519, 436, 520, 472, 631, 440, 652, 390, 653, 351, 666, 321, 619, 246)],
		city: ["Capital City", new PIXI.Polygon(456,307, 519, 436, 520, 472,328,496,258,477,259,401)],
		harbor: ["The Harbor", new PIXI.Polygon(245,262,258,477,205,448,179,397,180,350,161,313)],
		ice: ["Icy Caves", new PIXI.Polygon(161,313,245,262,283,190,236,167,184,186,168,213,138,223,131,263)],
		desert:["Lonely Desert", new PIXI.Polygon(245,262,283,190,326,202,466,196,511,219,555,221,456,307,259,401)]
	};
	for (key in areainfo) {
		var graphics = new PIXI.Graphics();
		graphics.interactive = true;
		graphics.buttonMode = true;
		(function (k) {
			graphics.hitArea = areainfo[k][1];
			graphics.click = function () {
				if (k in Quest.areas) startQuestArea(k);
			}
			graphics.mouseover = function() {
				tinfo.setText(areainfo[k][0]);
			}
		})(key);
		questui.addChild(graphics);
	}
	refreshRenderer(questui);
}
function startQuestArea(area) {
	startQuest("necromancer");
	startQuest("bombmaker");
	startQuest("blacksummoner");
	startQuest("icecave");
	startQuest("inventor");
	var questui = new PIXI.DisplayObjectContainer();
	questui.interactive = true;
	var bgquest = new PIXI.Sprite(backgrounds[3]);
	bgquest.interactive = true;
	bgquest.hitArea = new PIXI.Rectangle(0, 0, 900, 670);
	bgquest.mouseover = function() {
		tinfo.setText("");
	}
	questui.addChild(bgquest);
	var tinfo = makeText(50, 26, "");
	var errinfo = makeText(50, 125, "");
	function makeQuestButton(quest, stage, text, pos) {
		var button = makeButton(pos[0], pos[1], user.quest[quest] > stage ? questIcons[1] : questIcons[0]);
		button.mouseover = function() {
			tinfo.setText(text);
		}
		button.click = function() {
			errinfo.setText(mkQuestAi(quest, stage, area) || "");
		}
		return button;
	}
	for (var i = 0;i < Quest.areas[area].length;i++) {
		var key = Quest.areas[area][i];
		if ((user.quest[key] !== undefined) && Quest[key]) {
			for (var j = 0;j <= user.quest[key];j++) {
				if (Quest[key].info.pos[j]) {
					questui.addChild(makeQuestButton(key, j, Quest[key].info.text[j], Quest[key].info.pos[j]));
				}
			}
		}
	}
	var bexit = makeButton(750, 246, "Exit");
	bexit.click = startQuestWindow;
	questui.addChild(tinfo);
	questui.addChild(errinfo);
	questui.addChild(bexit);
	refreshRenderer(questui);
}

function upgradestore() {
	function upgradeCard(card) {
		if (!card.upped) {
			if (!isFreeCard(card)) {
				var use = card.rarity < 5 ? 6 : 1;
				if (cardpool[card.code] >= use) {
					var bound = count(user.pool, card.code) < use;
					userEmit("upgrade", { card: card.code, bound: bound });
					for (var i = 0;i < use;i++) {
						var idx;
						if (bound && ~(idx = user.accountbound.indexOf(card.code))){
							user.accountbound.splice(idx, 1);
						}else{
							user.pool.splice(user.pool.indexOf(card.code), 1);
						}
					}
					user[bound?"accountbound":"pool"].push(card.asUpped(true).code);
					adjustdeck();
				}
				else twarning.setText("You need at least " + use + " copies to be able to upgrade this card!");
			}
			else {
				if (user.gold >= 50) {
					user.gold -= 50;
					userEmit("subgold", { g: 50 });
					userEmit("addcards", { c: etgutil.encodedeck([card.asUpped(true).code]) });
					user.pool.push(card.asUpped(true).code);
					adjustdeck();
				}
				else twarning.setText("You need at least 50 gold to be able to upgrade a pillar!");
			}
		}
		else twarning.setText("You can't upgrade an already upgraded card!");
	}
	var cardValues = [5, 1, 3, 15, 20];
	function sellCard(card) {
		if (card.rarity != 0 || card.upped) {
			if (card.rarity <= 4) {
				var idx = user.pool.indexOf(card.code);
				if (~idx) {
					user.pool.splice(idx, 1);
					var sellValue = cardValues[card.rarity] * (card.upped ? 5 : 1);
					user.gold += sellValue
					userEmit("sellcard", { card: card.code, gold: sellValue});
					adjustdeck();
				}
			}
			else twarning.setText("You really don't want to sell that, trust me.")
		}
		else twarning.setText("You can't sell a pillar or pendulum, silly!")
	}
	function adjustdeck() {
		cardpool = {};
		for (var i = 0;i < user.pool.length;i++) {
			if (user.pool[i] in cardpool) {
				cardpool[user.pool[i]]++;
			} else {
				cardpool[user.pool[i]] = 1;
			}
		}
		for (var i = 0;i < user.accountbound.length;i++) {
			if (user.accountbound[i] in cardpool) {
				cardpool[user.accountbound[i]]++;
			} else {
				cardpool[user.accountbound[i]] = 1;
			}
		}
	}
	var upgradeui = new PIXI.DisplayObjectContainer();
	upgradeui.interactive = true;
	upgradeui.addChild(new PIXI.Sprite(backgrounds[0]));

	var goldcount = makeText(30, 100, "");
	upgradeui.addChild(goldcount);
	var bupgrade = makeButton(150, 80, "Upgrade");
	bupgrade.click = function() {
		upgradeCard(CardCodes[selectedCard]);
	};
	upgradeui.addChild(bupgrade);
	var bsell = makeButton(150, 140, "Sell");
	bsell.click = function() {
		sellCard(CardCodes[selectedCard]);
	};
	upgradeui.addChild(bsell);
	var bexit = makeButton(5, 50, "Exit");
	bexit.click = startMenu;
	upgradeui.addChild(bexit);
	var tinfo = new PIXI.Text("", { font: "bold 16px Dosis" });
	tinfo.position.set(150, 102);
	upgradeui.addChild(tinfo);
	var tinfo2 = new PIXI.Text("", { font: "bold 16px Dosis" });
	tinfo2.position.set(150, 162);
	upgradeui.addChild(tinfo2);
	var twarning = new PIXI.Text("", { font: "bold 16px Dosis" });
	twarning.position.set(100, 50);
	upgradeui.addChild(twarning);

	var cardsel = makeCardSelector(null,
		function(code){
			var card = CardCodes[code];
			selectedCard = code;
			upgradedCard = card.asUpped(true).code;
			tinfo.setText(isFreeCard(card) ? "Costs 50 gold to upgrade" : card.rarity < 5 ? "Convert 6 of these into an upgraded version." : "Convert into an upgraded version.");
			tinfo2.setText((card.rarity > 0 || card.upped) && card.rarity < 5 ?
				"Sells for " + cardValues[card.rarity] * (card.upped ? 5 : 1) + " gold." : "");
			twarning.setText("");
		}
	);
	upgradeui.addChild(cardsel);
	var selectedCard, upgradedCard;
	var cardpool;
	adjustdeck();

	var cardArt = new PIXI.Sprite(nopic);
	cardArt.position.set(734, 8);
	upgradeui.addChild(cardArt);
	var selectedCardArt = new PIXI.Sprite(nopic);
	selectedCardArt.position.set(534, 8);
	upgradeui.addChild(selectedCardArt);
	refreshRenderer(upgradeui, function() {
		cardsel.next(cardpool, {});
	    if (upgradedCard) {
	        cardArt.setTexture(getArt(upgradedCard));
		}
		if (selectedCard) {
			selectedCardArt.setTexture(getArt(selectedCard));
		}
		goldcount.setText("$" + user.gold);
	});
}

function startStore() {
	var packdata = [
		{cost: 15, info: "Bronze Pack: 9 Commons"},
		{cost: 25, info: "Silver Pack: 3 Commons, 3 Uncommons"},
		{cost: 65, info: "Gold Pack: 3 Commons, 4 Uncommons, 1 Rare"},
		{cost: 100, info: "Platinum Pack: 4 Commons, 3 Uncommons, 1 Rare, 1 Shard"},
	];
	var packele = -1, packrarity = -1, newCardsArt = [];
	newCards = []

	var storeui = new PIXI.DisplayObjectContainer();
	storeui.interactive = true;

	//shop background
	storeui.addChild(new PIXI.Sprite(backgrounds[2]));

	//gold text
	var tgold = makeText(750, 101, "$" + user.gold);
	storeui.addChild(tgold);

	//info text
	var tinfo = makeText(50, 26, "Select from which element you want.");
	storeui.addChild(tinfo);

	var tinfo2 = makeText(50, 51, "Select which type of booster you want.");
	storeui.addChild(tinfo2);

    //free packs text
	var freeinfo = makeText(300, 26, "");
	storeui.addChild(freeinfo);

	//get cards button
	var bget = makeButton(750, 156, "Take Cards");
	toggleB(bget);
	bget.click = function () {
		toggleB(bbronze, bsilver, bgold, bplatinum, bget, bbuy);
		popbooster.visible = false;
		newCards.length = 0;
	}
	storeui.addChild(bget);

	//exit button
	var bexit = makeButton(750, 246, "Exit");
	bexit.click = startMenu;
	storeui.addChild(bexit);

	//buy button
	var bbuy = makeButton(750, 156, "Buy Pack");
	bbuy.click = function() {
		if (packrarity == -1) {
			tinfo2.setText("Select a pack first!");
			return;
		}
		if (packele == -1) {
			tinfo.setText("Select an element first!");
			return;
		}
		var pack = packdata[packrarity];
		if (user.gold >= pack.cost || user.freepacks[packrarity] > 0) {
			userEmit("booster", { pack: packrarity, element:packele });
			toggleB(bbronze, bsilver, bgold, bplatinum, bget, bbuy);
			popbooster.visible = true;
			updateFreeText();
		} else {
			tinfo2.setText("You can't afford that!");
		}
	}
	storeui.addChild(bbuy);

	function updateFreeText(){
		freeinfo.setText(user.freepacks[packrarity] ? "Free boosters of this type left: " + user.freepacks[packrarity] : "");
	}

	// The different pack types
	function gradeSelect(x){
		return function(){
			packrarity = x;
			tinfo2.setText(packdata[x].info);
			updateFreeText();
		}
	}
	var bbronze = makeButton(50, 280, boosters[0]);
	bbronze.click = gradeSelect(0);
	storeui.addChild(bbronze);
	var bsilver = makeButton(175, 280, boosters[1]);
	bsilver.click = gradeSelect(1);
	storeui.addChild(bsilver);
	var bgold = makeButton(300, 280, boosters[2]);
	bgold.click = gradeSelect(2);
	storeui.addChild(bgold);
	var bplatinum = makeButton(425, 280, boosters[3]);
	bplatinum.click = gradeSelect(3);
	storeui.addChild(bplatinum);

	for (var i = 0;i < 12;i++) {
		var elementbutton = makeButton(75 + Math.floor(i / 2)*75, 120 + (i % 2)*75, eicons[i+1]);
		(function(_i) {
			elementbutton.click = function() {
				packele = _i + 1;
				tinfo.setText("Selected Element: " + etg.eleNames[packele]);
			}
		})(i);
		storeui.addChild(elementbutton);
	}

	//booster popup
	var popbooster = new PIXI.Sprite(popups[0]);
	popbooster.position.set(43, 93);
	popbooster.visible = false;
	storeui.addChild(popbooster);

	//draw cards that are pulled from a pack
	for (var i = 0;i < 2;i++) {
		for (var j = 0;j < 5;j++) {
			var cardArt = new PIXI.Sprite(nopic);
			cardArt.scale.set(0.85, 0.85);
			cardArt.position.set(7 + (j * 125), 7 + (i * 225));
			popbooster.addChild(cardArt);
			newCardsArt.push(cardArt);
		}
	}

	refreshRenderer(storeui, function() {
		for (var i = 0;i < newCards.length;i++) {
			newCardsArt[i].setTexture(getArt(newCards[i]));
			newCardsArt[i].visible = true;
		}
		for (; i < newCardsArt[i].length; i++) {
			newCardsArt[i].visible = false;
		}
		tgold.setText("$" + user.gold);
	});
}

function startEditor() {
	function processDeck() {
		for (var i = editordeck.length - 1;i >= 0;i--) {
			if (!(editordeck[i] in CardCodes)) {
				var index = etg.TrueMarks.indexOf(editordeck[i]);
				if (~index) {
					editormark = index;
				}
				editordeck.splice(i, 1);
			}
		}
		editormarksprite.setTexture(eicons[editormark]);
		editordeck.sort(editorCardCmp);
		if (user) {
			cardminus = {};
			cardpool = {};
			for (var i = 0;i < user.pool.length;i++) {
				if (user.pool[i] in cardpool) {
					cardpool[user.pool[i]]++;
				} else {
					cardpool[user.pool[i]] = 1;
				}
			}
			if (user.accountbound) {
			    for (var i = 0; i < user.accountbound.length; i++) {
			        if (user.accountbound[i] in cardpool) {
			            cardpool[user.accountbound[i]]++;
			        } else {
			            cardpool[user.accountbound[i]] = 1;
			        }
			    }
			}
			for (var i = editordeck.length - 1;i >= 0;i--) {
				var code = editordeck[i];
				if (CardCodes[code].type != etg.PillarEnum) {
					var card = CardCodes[code];
					if ((cardminus[card.asUpped(false).code] || 0) + (cardminus[card.asUpped(true).code] || 0) == 6) {
						editordeck.splice(i, 1);
						continue;
					}
				}
				if (!isFreeCard(CardCodes[code])) {
					if ((cardminus[code] || 0) < (cardpool[code] || 0)) {
						adjust(cardminus, code, 1);
					} else {
						editordeck.splice(i, 1);
					}
				}
			}
		}
	}
	if (Cards) {
		var cardminus, cardpool, cardartcode;
		chatArea.value = "Build a 30-60 card deck";
		var editorui = new PIXI.DisplayObjectContainer(), editorelement = 0;
		editorui.interactive = true;
		editorui.addChild(new PIXI.Sprite(backgrounds[0]));
		var bclear = makeButton(8, 8, "Clear");
		var bsave = makeButton(8, 32, "Done");
		var bimport = makeButton(8, 56, "Import");
		var bdeck1 = makeButton(8, 80, "Deck 1");
		var bdeck2 = makeButton(8, 104, "Deck 2");
		var bdeck3 = makeButton(8, 128, "Deck 3");
		var barena = makeButton(8, 152, "Arena AI", function() {
			if (user && user.ocard) {
				cardartcode = user.ocard;
			}
		});
		bclear.click = function() {
			if (user) {
				cardminus = {};
			}
			editordeck.length = 0;
		}
		bsave.click = function() {
			editordeck.push(etg.TrueMarks[editormark]);
			deckimport.value = editordeck.join(" ");
			if (user) {
				userEmit("setdeck", { d: etgutil.encodedeck(editordeck), number: user.selectedDeck });
				user.decks[user.selectedDeck] = editordeck;
			}
			startMenu();
		}
		bimport.click = function() {
			editordeck = deckimport.value.split(" ");
			if (editordeck.length > 60){
				editordeck.length = 60;
			}
			processDeck();
		}
		function switchDeckCb(x){
			return function(){
				editordeck.push(etg.TrueMarks[editormark]);
				userEmit("setdeck", { d: etgutil.encodedeck(editordeck), number: user.selectedDeck });
				user.selectedDeck = x;
				editordeck = getDeck(true);
				processDeck();
			}
		}
		bdeck1.click = switchDeckCb(0);
		bdeck2.click = switchDeckCb(1);
		bdeck3.click = switchDeckCb(2);
		barena.click = function() {
			if (user) {
				if (!user.ocard){
					chatArea.value = "You lack an oracle card";
					return;
				}else if (editordeck.length < 30) {
					chatArea.value = "30 cards required before submission";
					return;
				}else if (~editordeck.indexOf(user.ocard)){
					chatArea.value = "Your deck cannot contain any of your oracle card; it'll be there when it gets there";
					return;
				}
				editordeck.push(etg.TrueMarks[editormark]);
				userEmit("setarena", { d: etgutil.encodedeck(editordeck) });
				editordeck.pop();
				chatArea.value = "Arena deck submitted";
			}
		}
		editorui.addChild(bclear);
		editorui.addChild(bsave);
		editorui.addChild(bimport);
		if (user) {
		    editorui.addChild(bdeck1);
		    editorui.addChild(bdeck2);
		    editorui.addChild(bdeck3);
		}
		if (user && user.ocard) {
			editorui.addChild(barena);
		}
		var editordecksprites = [];
		var editordeck = getDeck(true);
		var editormarksprite = new PIXI.Sprite(nopic);
		editormarksprite.position.set(100, 210);
		editorui.addChild(editormarksprite);
		var editormark = 0;
		processDeck();
		for (var i = 0;i < 13;i++) {
			var sprite = makeButton(200 + i * 32, 210, eicons[i]);
			sprite.interactive = true;
			(function(_i) {
				sprite.click = function() {
					editormark = _i;
					editormarksprite.setTexture(this.texture);
				}
			})(i);
			editorui.addChild(sprite);
		}
		for (var i = 0;i < 60;i++) {
			var sprite = new PIXI.Sprite(nopic);
			sprite.position.set(100 + Math.floor(i / 10) * 100, 8 + (i % 10) * 20);
			(function(_i) {
				sprite.click = function() {
					var card = CardCodes[editordeck[_i]];
					if (user && !isFreeCard(card)) {
						adjust(cardminus, editordeck[_i], -1);
					}
					editordeck.splice(_i, 1);
				}
				sprite.mouseover = function() {
					cardartcode = editordeck[_i];
				}
			})(i);
			sprite.interactive = true;
			editorui.addChild(sprite);
			editordecksprites.push(sprite);
		}
		setInteractive.apply(null, editordecksprites);
		var cardsel = makeCardSelector(
			function(code){
				cardartcode = code;
			},
			function(code){
				if (editordeck.length < 60) {
					var card = CardCodes[code];
					if (user && !isFreeCard(card)) {
						if (!(code in cardpool) || (code in cardminus && cardminus[code] >= cardpool[code]) ||
							(CardCodes[code].type != etg.PillarEnum && (cardminus[card.asUpped(false).code] || 0) + (cardminus[card.asUpped(true).code] || 0) >= 6)) {
							return;
						}
						adjust(cardminus, code, 1);
					}
					for (var i = 0;i < editordeck.length;i++) {
						var cmp = editorCardCmp(editordeck[i], code);
						if (cmp >= 0) break;
					}
					editordeck.splice(i, 0, code);
				}
			}
		);
		editorui.addChild(cardsel);
		var cardArt = new PIXI.Sprite(nopic);
		cardArt.position.set(734, 8);
		editorui.addChild(cardArt);
		refreshRenderer(editorui, function() {
			cardsel.next(cardpool, cardminus);
			if (cardartcode) {
				cardArt.setTexture(getArt(cardartcode));
			}
			for (var i = 0;i < editordeck.length;i++) {
				editordecksprites[i].visible = true;
				editordecksprites[i].setTexture(getCardImage(editordeck[i]));
			}
			for (;i < 60;i++) {
				editordecksprites[i].visible = false;
			}
		});
	}
}
function startElementSelect() {
	var stage = new PIXI.DisplayObjectContainer();
	stage.interactive = true;
	chatArea.value = "Select your starter element";
	var elesel = [];
	var eledesc = new PIXI.Text("", { font: "24px Dosis" });
	eledesc.position.set(100, 250);
	stage.addChild(eledesc);
	for (var i = 0;i < 13;i++) {
		elesel[i] = new PIXI.Sprite(eicons[i]);
		elesel[i].position.set(100 + i * 32, 300);
		(function(_i) {
			elesel[_i].mouseover = function() {
				maybeSetText(eledesc, etg.eleNames[_i]);
			}
			elesel[_i].click = function() {
				var msg = { u: user.name, a: user.auth, e: _i };
				user = undefined;
				socket.emit("inituser", msg);
				startMenu();
			}
		})(i);
		elesel[i].interactive = true;
		stage.addChild(elesel[i]);
	}
	refreshRenderer(stage);
}

function startMatch() {
	player2summon = function(cardinst) {
		var sprite = new PIXI.Sprite(nopic);
		sprite.position.set((foeplays.children.length % 9) * 100, Math.floor(foeplays.children.length / 9) * 20);
		sprite.card = cardinst.card;
		foeplays.addChild(sprite);
	}
	function drawBorder(obj, spr) {
		if (obj) {
			if (targetingMode) {
				if (targetingMode(obj)) {
					fgfx.lineStyle(2, 0xff0000);
					fgfx.drawRect(spr.position.x - spr.width / 2, spr.position.y - spr.height / 2, spr.width, spr.height);
					fgfx.lineStyle(2, 0xffffff);
				}
			} else if (obj.canactive() && !(obj.owner == game.player2 && game.player2.isCloaked())) {
				fgfx.lineStyle(2, obj.card.element == 8 ? 0x000000 : 0xffffff);
				fgfx.drawRect(spr.position.x - spr.width / 2, spr.position.y - spr.height / 2, spr.width, (obj instanceof etg.Weapon || obj instanceof etg.Shield ? 12 : 10));
			}
		}
	}
	function drawStatus(obj, spr) {
		spr.getChildAt(2).getChildAt(0).visible = obj.status.psion;
		spr.getChildAt(2).getChildAt(1).visible = obj.status.aflatoxin;
		spr.getChildAt(2).getChildAt(2).visible = obj.status.poison > 0;
		spr.getChildAt(2).getChildAt(3).visible = obj.passives.airborne || obj.passives.ranged;
		spr.getChildAt(2).getChildAt(4).visible = obj.status.momentum;
		spr.getChildAt(2).getChildAt(5).visible = obj.status.adrenaline;
		spr.getChildAt(2).getChildAt(6).visible = obj.status.poison < 0;
		spr.getChildAt(2).getChildAt(7).visible = obj.status.delayed;
		spr.getChildAt(2).getChildAt(8).visible = obj == obj.owner.gpull;
		spr.getChildAt(2).getChildAt(9).visible = obj.status.frozen;
		spr.alpha = obj.status.immaterial || obj.status.burrowed ? .7 : 1;
	}
	var aiDelay = 0;
	var animCb = function() {
		var now;
		if (game.phase == etg.PlayPhase && game.turn == game.player2 && game.player2.ai && (now = Date.now()) >= aiDelay) {
			aiDelay = now + 300;
			var cmd = game.player2.ai();
			cmds[cmd[0]](cmd[1]);
		}
		var pos = realStage.getMousePosition();
		maybeSetText(winnername, game.winner ? (game.winner == game.player1 ? "Won " : "Lost ") + game.ply : "");
		maybeSetButton(game.winner ? null : endturn, endturn);
		var cardartcode, cardartx;
		infobox.setTexture(nopic);
		for (var i = 0;i < foeplays.children.length;i++) {
			var foeplay = foeplays.children[i];
			if (hitTest(foeplay, pos)) {
				cardartcode = foeplay.card.code;
			}
		}
		for (var j = 0;j < 2;j++) {
			var pl = game.players[j];
			if (j == 0 || game.player1.precognition) {
				for (var i = 0;i < pl.hand.length;i++) {
					if (hitTest(handsprite[j][i], pos)) {
						cardartcode = pl.hand[i].card.code;
					}
				}
			}
			if (j == 0 || !(cloakgfx.visible)) {
				for (var i = 0;i < 23;i++) {
					var cr = pl.creatures[i];
					if (cr && hitTest(creasprite[j][i], pos)) {
						cardartcode = cr.card.code;
						cardartx = creasprite[j][i].position.x;
						setInfo(cr);
					}
				}
				for (var i = 0;i < 16;i++) {
					var pr = pl.permanents[i];
					if (pr && hitTest(permsprite[j][i], pos)) {
						cardartcode = pr.card.code;
						cardartx = permsprite[j][i].position.x;
						setInfo(pr);
					}
				}
				if (pl.weapon && hitTest(weapsprite[j], pos)) {
					cardartcode = pl.weapon.card.code;
					cardartx = weapsprite[j].position.x;
					setInfo(pl.weapon);
				}
				if (pl.shield && hitTest(shiesprite[j], pos)) {
					cardartcode = pl.shield.card.code;
					cardartx = shiesprite[j].position.x;
					setInfo(pl.shield);
				}
			}
		}
		if (cardartcode) {
			cardart.setTexture(getArt(cardartcode));
			cardart.visible = true;
			cardart.position.set(cardartx || 654, pos.y > 300 ? 44 : 300);
		} else cardart.visible = false;
		if (game.winner == game.player1 && user && !game.quest && game.player2.ai && !game.cardreward) {
			var winnable = [], cardwon;
			for (var i = 0;i < foeDeck.length;i++) {
				if (foeDeck[i].type != etg.PillarEnum && foeDeck[i].rarity < 4) {
					winnable.push(foeDeck[i]);
				}
			}
			if (winnable.length) {
				cardwon = winnable[Math.floor(Math.random() * winnable.length)];
				if (cardwon == 3 && Math.random() < .5)
					cardwon = winnable[Math.floor(Math.random() * winnable.length)];
			} else {
				var elewin = foeDeck[Math.floor(Math.random() * foeDeck.length)];
				cardwon = etg.PlayerRng.randomcard(elewin.upped, function(x) { return x.element == elewin.element && x.type != etg.PillarEnum && x.rarity <= 3; });
			}
			var goldwon;
			if (game.level !== undefined) {
				if (game.level < 2){
					cardwon = cardwon.asUpped(false);
				}
				var basereward = [1, 6, 11, 31][game.level];
				var hpfactor = [11, 7, 6, 2][game.level];
				goldwon = Math.floor((basereward + Math.floor(game.player1.hp / hpfactor)) * (game.player1.hp == game.player1.maxhp ? 1.5 : 1));
			}else goldwon = game.gold;
			if (goldwon !== undefined){
				game.goldreward = goldwon + (game.cost || 0);
			}
			game.cardreward = cardwon.code;
		}
		if (game.phase != etg.EndPhase) {
			cancel.visible = true;
			var endturnButton = accepthand.visible ? accepthand : (endturn.visible ? endturn : null);
			var cancelButton = mulligan.visible ? mulligan : (cancel.visible ? cancel : null);
			maybeSetButton(endturnButton, game.turn == game.player1 ? (game.phase == etg.PlayPhase ? endturn : accepthand) : null);
			maybeSetButton(cancelButton, game.turn == game.player1 ? (game.phase != etg.PlayPhase ? mulligan : (targetingMode || discarding) ? cancel : null) : null);
		}
		maybeSetText(turntell, discarding ? "Discard" : targetingMode ? targetingText : game.turn == game.player1 ? "Your Turn" : "Their Turn");
		for (var i = 0;i < foeplays.children.length;i++) {
			maybeSetTexture(foeplays.children[i], getCardImage(foeplays.children[i].card.code));
		}
		foeplays.visible = !(cloakgfx.visible = game.player2.isCloaked());
		fgfx.clear();
		if (game.turn == game.player1 && !targetingMode && game.phase != etg.EndPhase) {
			for (var i = 0;i < game.player1.hand.length;i++) {
				var card = game.player1.hand[i].card;
				if (game.player1.canspend(card.costele, card.cost)) {
					fgfx.beginFill(elecols[etg.Light]);
					fgfx.drawRect(handsprite[0][i].position.x + 100, handsprite[0][i].position.y, 20, 20);
					fgfx.endFill();
				}
			}
		}
		fgfx.beginFill(0, 0);
		fgfx.lineStyle(2, 0xffffff);
		for (var j = 0;j < 2;j++) {
			for (var i = 0;i < 23;i++) {
				drawBorder(game.players[j].creatures[i], creasprite[j][i]);
			}
			for (var i = 0;i < 16;i++) {
				drawBorder(game.players[j].permanents[i], permsprite[j][i]);
			}
			drawBorder(game.players[j].weapon, weapsprite[j]);
			drawBorder(game.players[j].shield, shiesprite[j]);
		}
		if (targetingMode) {
			fgfx.lineStyle(2, 0xff0000);
			for (var j = 0;j < 2;j++) {
				if (targetingMode(game.players[j])) {
					var spr = hptext[j];
					fgfx.drawRect(spr.position.x - spr.width / 2, spr.position.y - spr.height / 2, spr.width, spr.height);
				}
				for (var i = 0;i < game.players[j].hand.length;i++) {
					if (targetingMode(game.players[j].hand[i])) {
						var spr = handsprite[j][i];
						fgfx.drawRect(spr.position.x, spr.position.y, spr.width, spr.height);
					}
				}
			}
		}
		fgfx.lineStyle(0, 0, 0);
		fgfx.endFill();
		for (var j = 0;j < 2;j++) {
			if (game.players[j].sosa) {
				fgfx.beginFill(elecols[etg.Death], .5);
				var spr = hptext[j];
				fgfx.drawRect(spr.position.x - spr.width / 2, spr.position.y - spr.height / 2, spr.width, spr.height);
				fgfx.endFill();
			}
			if (game.players[j].flatline) {
				fgfx.beginFill(elecols[etg.Death], .3);
				fgfx.drawRect(handsprite[j][0].position.x - 2, handsprite[j][0].position.y - 2, 124, 164);
				fgfx.endFill();
			}
			if (game.players[j].silence) {
				fgfx.beginFill(elecols[etg.Aether], .3);
				fgfx.drawRect(handsprite[j][0].position.x - 2, handsprite[j][0].position.y - 2, 124, 164);
				fgfx.endFill();
			} else if (game.players[j].sanctuary) {
				fgfx.beginFill(elecols[etg.Light], .3);
				fgfx.drawRect(handsprite[j][0].position.x - 2, handsprite[j][0].position.y - 2, 124, 164);
				fgfx.endFill();
			}
			for (var i = 0;i < 8;i++) {
				maybeSetTexture(handsprite[j][i], getCardImage(game.players[j].hand[i] ? (j == 0 || game.player1.precognition ? game.players[j].hand[i].card.code : "0") : "1"));
			}
			for (var i = 0;i < 23;i++) {
				var cr = game.players[j].creatures[i];
				if (cr && !(j == 1 && cloakgfx.visible)) {
					creasprite[j][i].setTexture(getCreatureImage(cr.card));
					creasprite[j][i].visible = true;
					var child = creasprite[j][i].getChildAt(0);
					child.setTexture(getTextImage(cr.trueatk() + "|" + cr.truehp(), ui.mkFont(10, cr.card.upped ? "black" : "white"), maybeLighten(cr.card)));
					var child2 = creasprite[j][i].getChildAt(1);
					var activetext = cr.active.cast ? etg.casttext(cr.cast, cr.castele) + cr.active.cast.activename : (cr.active.hit ? cr.active.hit.activename : "");
					child2.setTexture(getTextImage(activetext, ui.mkFont(8, cr.card.upped ? "black" : "white")));
					drawStatus(cr, creasprite[j][i]);
				} else creasprite[j][i].visible = false;
			}
			for (var i = 0;i < 16;i++) {
				var pr = game.players[j].permanents[i];
				if (pr && !(j == 1 && cloakgfx.visible && !pr.passives.cloak)) {
					permsprite[j][i].setTexture(getPermanentImage(pr.card.code));
					permsprite[j][i].visible = true;
					permsprite[j][i].alpha = pr.status.immaterial ? .7 : 1;
					var child = permsprite[j][i].getChildAt(0);
					if (pr instanceof etg.Pillar) {
						child.setTexture(getTextImage("1:" + (pr.active.auto == Actives.pend && pr.pendstate ? pr.owner.mark : pr.card.element) + " x" + pr.status.charges, ui.mkFont(10, pr.card.upped ? "black" : "white"), maybeLighten(pr.card)));
					}
					else child.setTexture(getTextImage(pr.status.charges !== undefined ? " " + pr.status.charges : "", ui.mkFont(10, pr.card.upped ? "black" : "white"), maybeLighten(pr.card)));
					var child2 = permsprite[j][i].getChildAt(1);
					child2.setTexture(pr instanceof etg.Pillar ? nopic : getTextImage(pr.activetext().replace(" losecharge", ""), ui.mkFont(8, pr.card.upped ? "black" : "white")));
				} else permsprite[j][i].visible = false;
			}
			var wp = game.players[j].weapon;
			if (wp && !(j == 1 && cloakgfx.visible)) {
				weapsprite[j].visible = true;
				var child = weapsprite[j].getChildAt(0);
				child.setTexture(getTextImage(wp.trueatk() + "", ui.mkFont(12, wp.card.upped ? "black" : "white"), maybeLighten(wp.card)));
				child.visible = true;
				var child = weapsprite[j].getChildAt(1);
				child.setTexture(getTextImage(wp.activetext(), ui.mkFont(12, wp.card.upped ? "black" : "white")));
				child.visible = true;
				weapsprite[j].setTexture(getWeaponShieldImage(wp.card.code));
				drawStatus(wp, weapsprite[j]);
			} else weapsprite[j].visible = false;
			var sh = game.players[j].shield;
			if (sh && !(j == 1 && cloakgfx.visible)) {
				shiesprite[j].visible = true;
				var dr = sh.truedr();
				var child = shiesprite[j].getChildAt(0);
				child.setTexture(getTextImage(sh.status.charges ? "x" + sh.status.charges: "" + sh.truedr() + "", ui.mkFont(12, sh.card.upped ? "black" : "white"), maybeLighten(sh.card)));
				child.visible = true;
				var child = shiesprite[j].getChildAt(1);
				child.setTexture(getTextImage((sh.active.shield ? " " + sh.active.shield.activename : "") + (sh.active.buff ? " " + sh.active.buff.activename : "") + (sh.active.cast ? etg.casttext(sh.cast, sh.castele) + sh.active.cast.activename : ""), ui.mkFont(12, sh.card.upped ? "black" : "white")));
				child.visible = true;
				shiesprite[j].alpha = sh.status.immaterial ? .7 : 1;
				shiesprite[j].setTexture(getWeaponShieldImage(sh.card.code));
			} else shiesprite[j].visible = false;
			marksprite[j].setTexture(eicons[game.players[j].mark]);
			for (var i = 1;i < 13;i++) {
				maybeSetText(quantatext[j].getChildAt(i*2-2), game.players[j].quanta[i].toString());
			}
			maybeSetText(hptext[j], game.players[j].hp + "/" + game.players[j].maxhp);
			if (hitTest(hptext[j], pos)){
				setInfo(game.players[j]);
			}
			var poison = game.players[j].status.poison;
			var poisoninfo = !poison ? "" : (poison > 0 ? poison + " 1:2" : -poison + " 1:7") + (game.players[j].neuro ? " 1:10" : "");
			poisontext[j].setTexture(getTextImage(poisoninfo,16));
			maybeSetText(decktext[j], game.players[j].deck.length + "cards");
			maybeSetText(damagetext[j], game.players[j].foe.expectedDamage ? "Next HP-loss:" + game.players[j].foe.expectedDamage : "");
		}
		Effect.next(cloakgfx.visible);
	}
	if (user) {
		userEmit("addloss", { pvp: !game.player2.ai });
		if (!game.player2.ai) user.pvplosses++;
		else user.ailosses++;
	}
	gameui = new PIXI.DisplayObjectContainer();
	gameui.interactive = true;
	gameui.addChild(new PIXI.Sprite(backgrounds[4]));
	var cloakgfx = new PIXI.Graphics();
	cloakgfx.beginFill(0);
	cloakgfx.drawRect(130, 20, 660, 280);
	cloakgfx.endFill();
	gameui.addChild(cloakgfx);
	var winnername = new PIXI.Text("", { font: "16px Dosis" });
	winnername.position.set(800, 500);
	gameui.addChild(winnername);
	var endturn = makeButton(800, 540, "End Turn");
	var accepthand = makeButton(800, 540, "Accept Hand");
	var cancel = makeButton(800, 500, "Cancel");
	var mulligan = makeButton(800, 500, "Mulligan");
	var resign = makeButton(8, 24, "Resign");
	var confirm = makeButton(8, 24, "Confirm");
	gameui.addChild(endturn);
	gameui.addChild(cancel);
	gameui.addChild(mulligan);
	gameui.addChild(accepthand);
	gameui.addChild(resign);
	gameui.addChild(confirm);
	confirm.visible = cancel.visible = endturn.visible = false;
	var turntell = new PIXI.Text("", { font: "16px Dosis" });
	var foename = new PIXI.Text(game.foename || "Unknown Opponent", { font: "bold 18px Dosis", align: "center" });
	foename.position.set(5, 75);
	gameui.addChild(foename);
	endturnFunc = endturn.click = function(e, discard) {
		if (game.winner) {
			if (user) {
				if (game.winner == game.player1) {
					userEmit("addwin", { pvp: !game.player2.ai });
					if (game.player2.ai) {
						user.aiwins++;
						user.ailosses--;
					}
					else {
						user.pvpwins++;
						user.pvplosses--;
					}
				}
				if (game.arena) {
					userEmit("modarena", { aname: game.arena, won: game.winner == game.player2 });
					delete game.arena;
				}
				if (game.quest) {
					if (game.winner == game.player1 && (user.quest[game.quest[0]] <= game.quest[1] || !(game.quest[0] in user.quest)) && !game.autonext) {
						userEmit("updatequest", { quest: game.quest[0], newstage: game.quest[1] + 1 });
						user.quest[game.quest[0]] = game.quest[1] + 1;
					}
				}
				if (game.winner == game.player1 && game.quest && game.autonext) {
					mkQuestAi(game.quest[0], game.quest[1] + 1, game.area);
				}else{
					victoryScreen();
				}
			}
			else {
				startMenu();
				game = undefined;
			}
		} else if (game.turn == game.player1) {

			if (discard == undefined && game.player1.hand.length == 8) {
				discarding = true;
			} else {
				discarding = false;
				if (!game.player2.ai) {
					socket.emit("endturn", discard);
				}
				game.player1.endturn(discard);
				targetingMode = undefined;
				if (foeplays.children.length)
					foeplays.removeChildren();
			}
		}
	}
	accepthandfunc = accepthand.click = function() {
		if (!game.player2.ai) {
			socket.emit("mulligan", true);
		}
		game.progressMulligan();
		if (game.phase == etg.MulliganPhase2 && game.player2.ai) {
			game.progressMulligan();
		}
	}
	cancelFunc = cancel.click = function() {
		if (resigning) {
			maybeSetButton(confirm, resign);
			resigning = false;
		} else if (game.turn == game.player1) {
			if (targetingMode) {
				targetingMode = targetingModeCb = null;
			} else if (discarding) {
				discarding = false;
			}
		}
	}
	mulligan.click = function() {
		if ((game.phase == etg.MulliganPhase1 || game.phase == etg.MulliganPhase2) && game.turn == game.player1 && game.player1.hand.length > 0) {
			game.player1.drawhand(game.player1.hand.length - 1);
			socket.emit("mulligan");
		}
	}
	var resigning;
	resign.click = function() {
		maybeSetButton(resign, confirm);
		resigning = true;
	}
	confirm.click = function() {
		if (!game.player2.ai) {
			socket.emit("foeleft");
		}
		startMenu();
	}

	turntell.position.set(800, 570);
	gameui.addChild(turntell);
	function setInfo(obj) {
		if (obj.owner != game.player2 || !cloakgfx.visible || !obj.card || obj.card.isOf(Cards.Cloak)) {
			infobox.setTexture(getTextImage(obj.info(), ui.mkFont(10, "white"), 0, (obj instanceof etg.Weapon || obj instanceof etg.Shield ? 92 : 76)));
			var mousePosition = realStage.getMousePosition();
			infobox.position.set(mousePosition.x, mousePosition.y);
			infobox.visible = true;
		}
	}
	var handsprite = [new Array(8), new Array(8)];
	var creasprite = [new Array(23), new Array(23)];
	var permsprite = [new Array(16), new Array(16)];
	var weapsprite = [new PIXI.Sprite(nopic), new PIXI.Sprite(nopic)];
	var shiesprite = [new PIXI.Sprite(nopic), new PIXI.Sprite(nopic)];
	var marksprite = [new PIXI.Sprite(nopic), new PIXI.Sprite(nopic)];
	var quantatext = [new PIXI.DisplayObjectContainer(), new PIXI.DisplayObjectContainer()];
	var hptext = [new PIXI.Text("", { font: "18px Dosis" }), new PIXI.Text("", { font: "18px Dosis" })];
	var damagetext = [new PIXI.Text("", { font: "14px Dosis" }), new PIXI.Text("", { font: "14px Dosis" })];
	var poisontext = [new PIXI.Sprite(nopic), new PIXI.Sprite(nopic)];
	var decktext = [new PIXI.Text("", { font: "16px Dosis" }), new PIXI.Text("", { font: "16px Dosis" })];
	for (var j = 0;j < 2;j++) {
		(function(_j) {
			for (var i = 0;i < 8;i++) {
				handsprite[j][i] = new PIXI.Sprite(nopic);
				handsprite[j][i].position.set(j ? 20 : 780, (j ? 130 : 310) + 20 * i);
				(function(_i) {
					handsprite[j][i].click = function() {
						if (game.phase != etg.PlayPhase) return;
						var cardinst = game.players[_j].hand[_i];
						if (cardinst) {
							if (!_j && discarding) {
								endturn.click(null, _i);
							} else if (targetingMode) {
								if (targetingMode(cardinst)) {
									targetingMode = undefined;
									targetingModeCb(cardinst);
								}
							} else if (!_j && cardinst.canactive()) {
								if (cardinst.card.type != etg.SpellEnum) {
									console.log("summoning " + _i);
									socket.emit("cast", tgtToBits(cardinst));
									cardinst.useactive();
								} else {
									getTarget(cardinst, cardinst.card.active, function(tgt) {
										socket.emit("cast", tgtToBits(cardinst) | tgtToBits(tgt) << 9);
										cardinst.useactive(tgt);
									});
								}
							}
						}
					}
				})(i);
				gameui.addChild(handsprite[j][i]);
			}
			function makeInst(makestatuses, insts, i, pos, scale){
				if (scale === undefined) scale = 1;
				var spr = new PIXI.Sprite(nopic);
				var stattext = new PIXI.Sprite(nopic);
				stattext.position.set(-32 * scale, -32 * scale);
				spr.addChild(stattext);
				var activetext = new PIXI.Sprite(nopic);
				activetext.position.set(-32 * scale, -42 * scale);
				spr.addChild(activetext);
				if (makestatuses){
					var statuses = new PIXI.SpriteBatch();
					for (var k=0; k<7; k++){
						var icon = new PIXI.Sprite(sicons[k]);
						icon.alpha = .6;
						icon.anchor.y = 1;
						icon.position.set(-34 * scale + [4, 1, 1, 0, 3, 2, 1][k] * 8, 30 * scale);
						statuses.addChild(icon);
					}
					for (var k=0; k<3; k++){
						var icon = new PIXI.Sprite(sborders[k]);
						icon.position.set(-32 * scale, -40 * scale);
						icon.scale.set(scale, scale);
						statuses.addChild(icon);
					}
					spr.addChild(statuses);
				}
				spr.anchor.set(.5, .5);
				spr.position = pos;
				spr.click = function() {
					if (game.phase != etg.PlayPhase) return;
					var inst = insts ? insts[i] : game.players[_j][i];
					if (!inst) return;
					if (targetingMode && targetingMode(inst)) {
						targetingMode = undefined;
						targetingModeCb(inst);
					} else if (_j == 0 && !targetingMode && inst.canactive()) {
						getTarget(inst, inst.active.cast, function(tgt) {
							targetingMode = undefined;
							socket.emit("cast", tgtToBits(inst) | tgtToBits(tgt) << 9);
							inst.useactive(tgt);
						});
					}
				}
				return spr;
			}
			for (var i = 0;i < 23;i++) {
				gameui.addChild(creasprite[j][i] = makeInst(true, game.players[j].creatures, i, ui.creaturePos(j, i)));
			}
			for (var i = 0;i < 16;i++) {
				gameui.addChild(permsprite[j][i] = makeInst(false, game.players[j].permanents, i, ui.permanentPos(j, i)));
			}
			setInteractive.apply(null, handsprite[j]);
			setInteractive.apply(null, creasprite[j]);
			setInteractive.apply(null, permsprite[j]);
			marksprite[j].anchor.set(.5, .5);
			marksprite[j].position.set(750, 470);
			gameui.addChild(weapsprite[j] = makeInst(true, null, "weapon", new PIXI.Point(666, 512), 5/4));
			gameui.addChild(shiesprite[j] = makeInst(false, null, "shield", new PIXI.Point(710, 532), 5/4));
			if (j) {
				ui.reflectPos(weapsprite[j]);
				ui.reflectPos(shiesprite[j]);
				ui.reflectPos(marksprite[j]);
			}
			gameui.addChild(marksprite[j]);
			hptext[j].anchor.set(.5, .5);
			poisontext[j].anchor.set(.5, .5);
			decktext[j].anchor.set(.5, .5);
			damagetext[j].anchor.set(.5, .5);
			quantatext[j].position.set(j ? 792 : 0, j ? 100 : 308);
			hptext[j].position.set(50, 550);
			poisontext[j].position.set(50, 570);
			decktext[j].position.set(50, 530);
			damagetext[j].position.set(50, 510);
			if (j) {
				ui.reflectPos(hptext[j]);
				ui.reflectPos(poisontext[j]);
				ui.reflectPos(decktext[j]);
				ui.reflectPos(damagetext[j]);
			}
			var child;
			for (var k = 1;k < 13;k++) {
				quantatext[j].addChild(child = new PIXI.Text("", { font: "16px Dosis" }));
				child.position.set((k & 1) ? 32 : 86, Math.floor((k - 1) / 2) * 32 + 8);
				quantatext[j].addChild(child = new PIXI.Sprite(eicons[k]));
				child.position.set((k & 1) ? 0 : 54, Math.floor((k - 1) / 2) * 32);
			}
			hptext[j].click = function() {
				if (game.phase != etg.PlayPhase) return;
				if (targetingMode && targetingMode(game.players[_j])) {
					targetingMode = undefined;
					targetingModeCb(game.players[_j]);
				}
			}
		})(j);
		setInteractive.apply(null, weapsprite);
		setInteractive.apply(null, shiesprite);
		setInteractive.apply(null, hptext);
		gameui.addChild(quantatext[j]);
		gameui.addChild(hptext[j]);
		gameui.addChild(poisontext[j]);
		gameui.addChild(decktext[j]);
		gameui.addChild(damagetext[j]);
	}
	var fgfx = new PIXI.Graphics();
	gameui.addChild(fgfx);
	var anims = new PIXI.DisplayObjectContainer();
	gameui.addChild(anims);
	Effect.register(anims);
	var foeplays = new PIXI.SpriteBatch();
	gameui.addChild(foeplays);
	var infobox = new PIXI.Sprite(nopic);
	infobox.alpha = .7;
	infobox.anchor.set(.5, .5);
	gameui.addChild(infobox);
	var cardart = new PIXI.Sprite(nopic);
	cardart.position.set(654, 300);
	cardart.anchor.set(.5, 0);
	gameui.addChild(cardart);
	refreshRenderer(gameui, animCb);
}

function startArenaInfo(info) {
	if (!info) {
		chatArea.value = "You do not have an arena deck";
	}
	var stage = new PIXI.DisplayObjectContainer();
	stage.interactive = true;
	var winloss = new PIXI.Text((info.win || 0) + " - " + (info.loss || 0), { font: "16px Dosis" });
	winloss.position.set(200, 300);
	stage.addChild(winloss);
	var bret = makeButton(200, 400, "Exit");
	bret.click = startMenu;
	stage.addChild(bret);
	var batch = new PIXI.SpriteBatch();
	var ocard = new PIXI.Sprite(nopic);
	ocard.position.set(600, 300);
	batch.addChild(ocard);
	var deck = etgutil.decodedeck(info.deck), mark;
	chatArea.value = deck.join(" ");
	for (var i=0; i<deck.length; i++){
		var ismark = etg.TrueMarks.indexOf(deck[i]);
		if (~ismark){
			mark = ismark;
			deck.splice(i--, 1);
			continue;
		}
		var spr = new PIXI.Sprite(getCardImage(deck[i]));
		spr.position.set(100 + Math.floor(i / 10) * 100, 8 + (i % 10) * 20);
		batch.addChild(spr);
	}
	var spr = new PIXI.Sprite(eicons[mark || 0]);
	spr.position.set(100, 210);
	batch.addChild(spr);
	stage.addChild(batch);
	refreshRenderer(stage, function() {
		if (info.card) {
			ocard.setTexture(getArt(info.card));
		}
	});
}

function startArenaTop(info) {
	if (!info) {
		chatArea.value = "??";
		return;
	}
	var stage = new PIXI.DisplayObjectContainer();
	stage.interactive = true;
	for (var i = 0;i < info[1].length; i++) {
		var infotxt = new PIXI.Text((i+1) + "  " + info[0][i*2], { font: "16px Dosis" });
		infotxt.position.set(150, 50 + i * 24);
		var scoretxt = new PIXI.Text(info[0][i*2 + 1], { font: "16px Dosis" });
		scoretxt.position.set(400, 50 + i * 24);
		var winlosstxt = new PIXI.Text(info[1][i], { font: "16px Dosis" });
		winlosstxt.position.set(450, 50 + i * 24);
		stage.addChild(infotxt);
		stage.addChild(scoretxt);
		stage.addChild(winlosstxt);
	}
	var bret = makeButton(50, 300, "Exit");
	bret.click = startMenu;
	stage.addChild(bret);
	refreshRenderer(stage);
}

function getTextImage(text, font, bgcolor, width) {
	if (!text) return nopic;
	if (bgcolor === undefined) bgcolor = "";
	var size;
	if (typeof font == "number"){
		size = font;
		font = ui.mkFont(font);
	}else size = parseInt(font.font);
	var fontkey = JSON.stringify(font) + bgcolor + "w" + width;
	if (!(fontkey in tximgcache)) {
		tximgcache[fontkey] = {};
	}
	if (text in tximgcache[fontkey]) {
		return tximgcache[fontkey][text];
	}
	var doc = new PIXI.DisplayObjectContainer();
	if (bgcolor !== ""){
		var bg = new PIXI.Graphics();
		doc.addChild(bg);
	}
	var pieces = text.replace(/\|/g, " | ").split(/(\d\d?:\d\d?|\$|\n)/);
	var x = 0, y = 0, h = Math.max(size, new PIXI.Text("j", font).height), w = 0;
	function pushChild(){
		var w = 0;
		for (var i = 0; i<arguments.length; i++){
			var c = arguments[i];
			w += c.width;
		}
		if (width && x + w > width){
			x = 0;
			y += h;
		}
		for (var i = 0; i<arguments.length; i++){
			var c = arguments[i];
			c.position.set(x, y);
			x += c.width;
			doc.addChild(c);
		}
	}
	for (var i = 0;i < pieces.length;i++) {
		var piece = pieces[i];
		if (piece == "\n"){
			w = Math.max(w, x);
			x = 0;
			y += h;
		}else if (piece == "$"){
			var spr = new PIXI.Sprite(goldtex);
			spr.scale.set(size/16, size/16);
			pushChild(spr);
		}else if (/^\d\d?:\d\d?$/.test(piece)) {
			var parse = piece.split(":");
			var num = parseInt(parse[0]);
			var icon = eicons[parseInt(parse[1])];
			if (num < 4) {
				var icons = [];
				for (var j = 0;j < num;j++) {
					var spr = new PIXI.Sprite(icon);
					spr.scale.set(size/32, size/32);
					icons.push(spr);
				}
				pushChild.apply(null, icons);
			}else{
				var spr = new PIXI.Sprite(icon);
				spr.scale.set(size/32, size/32);
				pushChild(new PIXI.Text(num, font), spr);
			}
		} else {
			var txt = new PIXI.Text(piece, font);
			if (!width || x + txt.width < width){
				pushChild(txt);
			}else{
				var words = piece.split(" ");
				for (var j = 0;j < words.length;j++) {
					if (words[j]){
						pushChild(new PIXI.Text(words[j], font));
						if (x){
							x += 3;
						}
					}
				}
			}
		}
	}
	var rtex = new PIXI.RenderTexture(width || Math.max(w, x), y+h);
	if (bg){
		bg.beginFill(bgcolor);
		bg.drawRect(0, 0, rtex.width, rtex.height);
		bg.endFill();
	}
	rtex.render(doc);
	return tximgcache[fontkey][text] = rtex;
}

var cmds = {};
cmds.endturn = function(data) {
	game.player2.endturn(data);
}
cmds.cast = function(bits) {
	var c = bitsToTgt(bits & 511), t = bitsToTgt((bits >> 9) & 511);
	console.log("cast: " + c.card.name + " " + (t ? (t instanceof etg.Player ? t == game.player1 : t.card.name) : "-"));
	if (c instanceof etg.CardInstance) {
		player2summon(c);
	}
	c.useactive(t);
}
function addChatMessage(message) {
	var scroll = chatBox.scrollTop == (chatBox.scrollHeight - chatBox.offsetHeight);
	chatBox.innerHTML += message;
	if (scroll) chatBox.scrollTop = chatBox.scrollHeight;
}
var socket = io(location.hostname + ":13602");
socket.on("pvpgive", initGame);
socket.on("tradegive", initTrade);
socket.on("librarygive", initLibrary);
socket.on("foearena", function(data) {
	var deck = etgutil.decodedeck(data.deck + data.deck);
	chatArea.value = data.name + ": " + deck.join(" ");
	initGame({ first: data.first, deck: deck, urdeck: getDeck(), seed: data.seed, hp: data.hp, cost: data.cost, foename: data.name }, aiEvalFunc);
	game.arena = data.name;
	game.level = 1;
	game.cost = 10;
});
socket.on("arenainfo", startArenaInfo);
socket.on("arenatop", startArenaTop);
socket.on("userdump", function(data) {
	user = data;
	prepuser();
	startMenu();
});
socket.on("passchange", function(data) {
	user.auth = data;
	chatArea.value = "Password updated";
});
socket.on("endturn", cmds.endturn);
socket.on("cast", cmds.cast);
socket.on("foeleft", function(data) {
	if (game && !game.player2.ai) {
		game.setWinner(game.player1);
	}
});
socket.on("chat", function(data) {
	var now = new Date(), h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
	if (h < 10) h = "0"+h;
	if (m < 10) m = "0"+m;
	if (s < 10) s = "0"+s;
	var msg = h + ":" + m + ":" + s + " " + (data.u ? "<b>" + sanitizeHtml(data.u) + ":</b> " : "") + sanitizeHtml(data.msg);
	var color = data.mode == "pm" ? "blue" : data.mode == "info" ? "red" : "black";
	addChatMessage(data.mode == "guest" ? "<font color=black><i>" + msg + "</i></font><br>" : "<font color=" + color + ">" + msg + "</font><br>");
	if (Notification && user && ~data.msg.indexOf(user.name) && !document.hasFocus()){
		Notification.requestPermission();
		var n = new Notification(data.u, {body: data.msg});
		n.onclick = window.focus;
	}
});
socket.on("mulligan", function(data) {
	if (data === true) {
		game.progressMulligan();
	} else {
		game.player2.drawhand(game.player2.hand.length - 1);
	}
});
socket.on("cardchosen", function(data) {
	player2Cards = data.cards;
});
socket.on("tradedone", function(data) {
	Array.prototype.push.apply(user.pool, data.newcards);
	for (var i = 0;i < data.oldcards.length;i++) {
		user.pool.splice(user.pool.indexOf(data.oldcards[i]), 1);
	}
	startMenu();
});
socket.on("tradecanceled", function(data) {
	startMenu();
});
socket.on("codecard", function(data) {
	startRewardWindow(data);
});
socket.on("codereject", function(data) {
	addChatMessage("<font color=red>" + data + "</font><br>");
});
socket.on("codegold", function(data) {
	user.gold += data;
	addChatMessage("<font color=red>" + data + " Gold added!</font><br>");
});
socket.on("codecode", function(data) {
	user.pool.push(data);
	addChatMessage("<font color=red>" + CardCodes[data].name + " added!</font><br>");
});
socket.on("codedone", function(data) {
	user.pool.push(data.card);
	addChatMessage("<font color=red>Card Added!</font><br>");
	startMenu();
});
socket.on("boostergive", function(data) {
	newCards = etgutil.decodedeck(data.cards);
	if (data.accountbound) {
		Array.prototype.push.apply(user.accountbound, newCards);
		user.freepacks[data.packtype]--;
	}
	else {
		Array.prototype.push.apply(user.pool, newCards);
		user.gold -= data.cost;
	}
});
function maybeSendChat(e) {
	e.cancelBubble = true;
	if (e.keyCode != 13) return;
	if (chatinput.value) {
		var msg = chatinput.value;
		chatinput.value = "";
		if (user){
			var checkPm = msg.split(" ");
			if (checkPm[0] == "/w") {
				var match = msg.match(/^\/w"(?:[^"\\]|\\.)*"/);
				var to = (match && match[0]) || checkPm[1];
				msg = msg.substring(3).replace(to, "");
				chatinput.value = "/w " + to + " ";
			}
			userEmit("chat", { msg: msg, to: to ? to.replace(/"/g, "") : null });
		}
		else {
			var name = username.value || guestname || (guestname = (10000 + Math.floor(Math.random() * 89999)) + "");
			socket.emit("guestchat", { msg: msg, u: name });
		}
		e.preventDefault();
	}
}
function sanitizeHtml(x) {
	return x.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function unaryParseInt(x) {
	return parseInt(x, 10);
}
function maybeLogin(e) {
	e.cancelBubble = true;
	if (e.keyCode != 13) return;
	if (username.value) {
		loginClick();
	}
}
function maybeChallenge(e) {
	e.cancelBubble = true;
	if (e.keyCode != 13) return;
	if (foename.value) {
		challengeClick();
	}
}
function animate() {
	setTimeout(requestAnimate, 40);
	if (realStage.next) {
		realStage.next();
	}
	renderer.render(realStage);
}
function requestAnimate() { requestAnimFrame(animate); }
document.addEventListener("keydown", function(e) {
	if (realStage.children[0] == gameui) {
		if (e.keyCode == 32) { // spc
			if (game.turn == game.player1 && (game.phase == etg.MulliganPhase1 || game.phase == etg.MulliganPhase2))
				accepthandfunc();
			else
				endturnFunc();
		} else if (e.keyCode == 8) { // bsp
			cancelFunc();
		} else if (e.keyCode == 83 || e.keyCode == 87) { // s/w
			var p = game.players[e.keyCode == 83 ? 0 : 1];
			if (targetingMode && targetingMode(p)) {
				targetingMode = undefined;
				targetingModeCb(p);
			}
		} else return;
		e.preventDefault();
	}
});
document.addEventListener("click", function(e) {
	if (e.pageX < 900 && e.pageY < 600) {
		e.preventDefault();
	}
});
function prepuser(){
	user.decks = [
		etgutil.decodedeck(user.deck0),
		etgutil.decodedeck(user.deck1),
		etgutil.decodedeck(user.deck2),
	];
	deckimport.value = getDeck().join(" ");
	user.pool = etgutil.decodedeck(user.pool);
	user.accountbound = etgutil.decodedeck(user.accountbound);
	if (!user.quest) {
		user.quest = {};
	}
	if (user.freepacks) {
		user.freepacks = user.freepacks.split(",").map(unaryParseInt);
	}
	if (!user.ailosses) user.ailosses = 0;
	if (!user.aiwins) user.aiwins = 0;
	if (!user.pvplosses) user.pvplosses = 0;
	if (!user.pvpwins) user.pvpwins = 0;
}
function loginClick() {
	if (!user) {
		var xhr = new XMLHttpRequest();
		xhr.open("POST", "auth?u=" + encodeURIComponent(username.value) + (password.value.length ? "&p=" + encodeURIComponent(password.value) : ""), true);
		xhr.onreadystatechange = function() {
			if (this.readyState == 4) {
				if (this.status == 200) {
					user = JSON.parse(this.responseText);
					if (!user) {
						chatArea.value = "No user";
					} else if (!user.accountbound && !user.pool) {
						startElementSelect();
					} else {
						prepuser();
						startMenu();
					}
				} else if (this.status == 404) {
					chatArea.value = "Incorrect password";
				} else if (this.status == 502) {
					chatArea.value = "Error verifying password";
				}
			}
		}
		xhr.send();
	}
}
function changeClick() {
	userEmit("passchange", { p: password.value });
}
function challengeClick() {
	if (Cards) {
		var deck = getDeck();
		if (deck.length < (user ? 31 : 11)){
			startEditor();
			return;
		}
		if (user) {
			userEmit("foewant", { f: foename.value, DGmode:demigodmode.checked });
		}else{
			socket.emit("pvpwant", { deck: deck, room: foename.value, DGmode: demigodmode.checked });
		}
	}
}
function tradeClick() {
	if (Cards)
		userEmit("tradewant", { f: foename.value });
}
function rewardClick() {
	if (Cards)
		userEmit("codesubmit", { code: foename.value });
}
function libraryClick() {
	if (Cards)
		socket.emit("librarywant", { f: foename.value });
}
var expofuncs = [maybeLogin, maybeChallenge, maybeSendChat, changeClick, challengeClick, tradeClick, rewardClick, libraryClick, loginClick, getTextImage];
for(var i=0; i<expofuncs.length; i++){
	window[expofuncs[i].name] = expofuncs[i];
}
})();