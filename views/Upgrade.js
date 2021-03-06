"use strict";
const sock = require("../sock"),
	Cards = require("../Cards"),
	etgutil = require("../etgutil"),
	userutil = require("../userutil"),
	Components = require('../Components'),
	h = preact.h;

module.exports = class Upgrade extends preact.Component {
	render() {
		const self = this, children = [];
		function upgradeCard(card) {
			if (!card.isFree()) {
				if (card.upped) return "You cannot upgrade upgraded cards.";
				var use = card.rarity != -1 ? 6 : 1;
				if (cardpool[card.code] >= use) {
					sock.userExec("upgrade", { card: card.code });
				}
				else return "You need at least " + use + " copies to be able to upgrade this card!";
			}
			else if (sock.user.gold >= 50) {
				sock.userExec("uppillar", { c: card.code });
			}
			else return "You need 50$ to afford an upgraded pillar!";
		}
		function unupgradeCard(card) {
			if (card.rarity || (card.shiny && card.upped)) {
				if (!card.upped) return "You cannot unupgrade unupgraded cards.";
				sock.userExec("unupgrade", { card: card.code });
			}
			else return "You cannot unupgrade pillars; sell it instead."
		}
		function polishCard(card) {
			if (!card.isFree()) {
				if (card.shiny) return "You cannot polish shiny cards.";
				if (card.rarity == 5) return "You cannot polish Nymphs.";
				var use = card.rarity != -1 ? 6 : 2;
				if (cardpool[card.code] >= use) {
					sock.userExec("polish", { card: card.code });
				}
				else return "You need at least " + use + " copies to be able to polish this card!";
			}
			else if (sock.user.gold >= 50) {
				sock.userExec("shpillar", { c: card.code });
			}
			else return "You need 50$ to afford a shiny pillar!";
		}
		function unpolishCard(card) {
			if (card.rarity || (card.shiny && card.upped)) {
				if (!card.shiny) return "You cannot unpolish non-shiny cards.";
				if (!card.rarity == 5) return "You cannot unpolish Nymphs.";
				sock.userExec("unpolish", { card: card.code });
			}
			else return "You cannot unpolish pillars; sell them instead.";
		}
		function sellCard(card) {
			if (card.rarity == -1) return "You really don't want to sell that, trust me.";
			else if (card.isFree()){
				if (sock.user.gold >= 300){
					sock.userExec("upshpillar", {c: card.code});
				}else return "You need 300$ to afford a shiny upgraded pillar!";
			}else{
				var codecount = etgutil.count(sock.user.pool, card.code);
				if (codecount) {
					sock.userExec("sellcard", { card: card.code });
				}
				else return "This card is bound to your account; you cannot sell it.";
			}
		}
		function eventWrap(func){
			return function(){
				const error = self.state.code1 ? func(Cards.Codes[self.state.code1]) : "Pick a card, any card.";
				if (error) self.setState({ error: error });
				else self.setState({});
			}
		}
		function autoCards(){
			sock.userExec("upshall");
			self.setState({});
		}
		const exit = h(Components.ExitBtn, { x: 5, y: 50, doNav: this.props.doNav }),
			bupgrade = self.state.canGrade && h('input', {
				type: 'button',
				value: self.state.downgrade ? 'Downgrade' : 'Upgrade',
				onClick: eventWrap(self.state.downgrade ? downgradeCard : upgradeCard),
				style: {
					position: 'absolute',
					left: '150px',
					top: '50px',
				},
			}),
			bpolish = self.state.canLish && h('input', {
				type: 'button',
				value: self.state.downlish ? 'Unpolish' : 'Polish',
				onClick: eventWrap(self.state.downlish ? unpolishCard : polishCard),
				style: {
					position: 'absolute',
					left: '150px',
					top: '95px',
				},
			}),
			bsell = self.state.canSell && h('input', {
				type: 'button',
				value: self.state.sellText,
				onClick: eventWrap(sellCard),
				style: {
					position: 'absolute',
					left: '150px',
					top: '140px',
				},
			}),
			autoconv = h('input', {
				type: 'button',
				value: 'Autoconvert',
				onClick: autoCards,
				style: {
					position: 'absolute',
					left: '5px',
					top: '140px',
				},
			}),
			goldcount = h(Components.Text, {
				text: sock.user.gold + '$',
				style: {
					position: 'absolute',
					left: '5px',
					top: '240px',
				},
			}),
			tinfo1 = h(Components.Text, {
				text: self.state.info1,
				style: {
					position: 'absolute',
					left: '250px',
					top: '50px',
				},
			}),
			tinfo2 = h(Components.Text, {
				text: self.state.info2,
				style: {
					position: 'absolute',
					left: '250px',
					top: '140px',
				},
			}),
			tinfo3 = h(Components.Text, {
				text: self.state.info3,
				style: {
					position: 'absolute',
					left: '250px',
					top: '95px',
				},
			}),
			twarning = h(Components.Text, {
				text: self.state.error,
				style: {
					position: 'absolute',
					left: '100px',
					top: '170px',
				},
			});
		children.push(exit, bupgrade, bpolish, bsell, autoconv, goldcount, tinfo1, tinfo2, tinfo3, twarning);

		if (self.state.code1) {
			children.push(h(Components.Card, {
				x: 734, y: 8, code: self.state.code1,
			}));
		}
		if (self.state.code2) {
			children.push(h(Components.Card, {
				x: 534, y: 8, code: self.state.code2,
			}));
		}

		const cardpool = etgutil.deck2pool(sock.user.accountbound, etgutil.deck2pool(sock.user.pool));
		const cardsel = h(Components.CardSelector, {
			cardpool: cardpool,
			maxedIndicator: true,
			onClick: function(code){
				const card = Cards.Codes[code];
				const newstate = {
					code1: code,
					code2: etgutil.asUpped(code, true),
					error: '',
					canGrade: true,
					canSell: !!~card.rarity,
					sellText: card.isFree() ? "Polgrade" : "Sell",
				};
				if (card.upped) {
					newstate.info1 = card.isFree() ? "" : card.rarity != -1 ? "Convert into 6 downgraded copies." : "Convert into a downgraded version.";
					newstate.downgrade = true;
				}else{
					newstate.info1 = card.isFree() ? "50$ to upgrade" : card.rarity != -1 ? "Convert 6 into an upgraded version." : "Convert into an upgraded version.";
					newstate.downgrade = false;
				}
				if (card.rarity == 5) {
					newstate.info3 = "This card cannot be " + (card.shiny ? "un" : "") + "polished.";
					newstate.canLish = false;
				}
				else if (card.shiny){
					newstate.info3 = card.isFree() ? "" : card.rarity != -1 ? "Convert into 6 non-shiny copies." : "Convert into 2 non-shiny copies.";
					newstate.downlish = true;
				}else{
					newstate.info3 = card.isFree() ? "50$ to polish" : card.rarity == 5 ? "This card cannot be polished." : card.rarity != -1 ? "Convert 6 into a shiny version." : "Convert 2 into a shiny version.";
					newstate.downlish = false;
				}
				newstate.info2 = card.rarity == -1 ? "" : card.isFree() ? "300$ to upgrade & polish" :
					"Sell for " + userutil.sellValues[card.rarity] * (card.upped ? 6 : 1) * (card.shiny ? 6 : 1) + "$";
				self.setState(newstate);
			},
		});
		children.push(cardsel);
		return h('div', { children: children });
	}
}