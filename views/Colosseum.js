"use strict";
const px = require("../px"),
	etg = require("../etg"),
	mkAi = require("../mkAi"),
	sock = require("../sock"),
	Decks = require("../Decks.json"),
	RngMock = require("../RngMock"),
	Components = require('../Components'),
	h = preact.h;
function mkDaily(doNav, type) {
	if (type < 3) {
		return function() {
			const gamedata = mkAi.mkAi(type == 1 ? 0 : 2, type)();
			if (gamedata){
				const dataNext = type == 1 ?
					{ goldreward: 200, endurance: 2, cost: 0, daily: 1, cardreward: "", noheal: true} :
					{ goldreward: 500, endurance: 1, cost: 0, daily: 2, cardreward: "" };
				gamedata.game.addData(dataNext);
				gamedata.game.dataNext = dataNext;
			}
			mkAi.run(doNav, gamedata);
		}
	}
	else {
		return function() {
			const gamedata = mkAi.mkPremade(type == 3 ? 1 : 3, type)();
			if (gamedata){
				gamedata.game.addonreward = type == 3 ? 90 : 200;
				sock.userExec("donedaily", { daily: type });
			}
			mkAi.run(doNav, gamedata);
		}
	}
}
module.exports = class Colosseum extends preact.Component {
	render() {
		const self = this;
		const magename = Decks.mage[sock.user.dailymage][0], dgname = Decks.demigod[sock.user.dailydg][0];
		const events = [
			"Novice Endurance Fight 3 Commoners in a row without healing in between. May try until you win.",
			"Expert Endurance: Fight 2 Champions in a row. May try until you win.",
			"Novice Duel: Fight " + magename + ". Only one attempt allowed.",
			"Expert Duel: Fight " + dgname + ". Only one attempt allowed."];
		const children = [h(Components.ExitBtn, { x: 50, y: 50, doNav: self.props.doNav })];
		for (var i=1; i<5; i++) {
			const active = !(sock.user.daily & (1 << i));
			if (active) {
				children.push(h('input', {
					type: 'button',
					value: 'Fight!',
					style: {
						position: 'absolute',
						left: '50px',
						top: 100+30*i+'px',
					},
					onClick:mkDaily(this.props.doNav, i),
				}));
			}
			children.push(h('span', { style: { position: 'absolute', left: '130px', top: 100+30*i+'px' }},
				active ? events[i-1] : i > 2 ? (sock.user.daily&(i==3?1:32) ? "You defeated this already today." : "You failed this today. Better luck tomorrow!") : "Completed."));
		}
		if (sock.user.daily == 191){
			children.push(h('input', {
				type: 'button',
				value: 'Nymph!',
				style: { position: 'absolute', left: '50px', top: '280px' },
				onClick: function(){
					const nymph = etg.NymphList[RngMock.upto(12)+1];
					sock.userExec("donedaily", {daily: 6, c: nymph});
					self.props.doNav(require('./MainMenu'), { nymph: nymph });
				}
			}), h('span', { style: { position: 'absolute', left: '130px', top: '280px' }}, "You successfully completed all tasks."));
		}
		return h('div', { children: children });
	}
}