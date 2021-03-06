"use strict";
const crypto = require("crypto"),
	sutil = require("./sutil"),
	db = require("./db"),
	Us = require("./Us"),
	etg = require("../etg"),
	aiDecks = require("../Decks"),
	etgutil = require("../etgutil"),
	RngMock = require("../RngMock"),
	userutil = require("../userutil");
module.exports = function(sockEmit){
	function loginRespond(socket, user, pass, authkey){
		function postHash(err, key){
			if (err){
				sockEmit(socket, "login", {err:err.message});
				return;
			}
			key = key.toString("base64");
			if (user.auth != key){
				if (user.auth){
					sockEmit(socket, "login", {err:"Incorrect password"});
					return;
				} else {
					user.auth = key;
				}
			}else if (!authkey && !user.algo){
				user.auth = user.salt = "";
				return loginRespond(socket, user, pass);
			}
			if (socket.readyState == 1){
				const day = sutil.getDay();
				if (user.oracle < day){
					user.oracle = day;
					const ocardnymph = Math.random() < .03;
					const card = RngMock.randomcard(false,
						x => x.type != etg.Pillar && ((x.rarity != 5) ^ ocardnymph) && x.code != user.ocard);
					const ccode = etgutil.asShiny(card.code, card.rarity == 5);
					if (card.rarity > 1) {
						user.accountbound = etgutil.addcard(user.accountbound, ccode);
					}
					else {
						user.pool = etgutil.addcard(user.pool, ccode);
					}
					user.ocard = ccode;
					user.daily = 0;
					user.dailymage = Math.floor(Math.random() * aiDecks.mage.length);
					user.dailydg = Math.floor(Math.random() * aiDecks.demigod.length);
				}
				Us.socks[user.name] = socket;
				socket.send('{"x":"login",'+JSON.stringify(user, function(key, val){ return this == user && key.match(/^(salt|iter|algo)$/) ? undefined : val }).slice(1));
				if (!user.daily) user.daily = 128;
				db.zadd("wealth", user.gold + userutil.calcWealth(user.pool), user.name);
			}
		}
		sutil.initsalt(user);
		if (authkey){
			postHash(null, authkey);
		}else if (pass){
			crypto.pbkdf2(pass, user.salt, user.iter, 64, user.algo||"SHA1", postHash);
		}else postHash(null, "");
	}
	function loginAuth(data){
		const name = (data.u || "").trim();
		if (!name.length){
			sockEmit(this, "login", {err:"No name"});
			return;
		}else{
			Us.load(name, user => loginRespond(this, user, data.p, data.a), () => {
				const user = Us.users[name] = {name: name, gold: 0};
				loginRespond(this, user, data.p, data.a);
			});
		}
	}
	return loginAuth;
}