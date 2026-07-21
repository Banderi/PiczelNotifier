if (chrome) {
	storage = chrome.storage;
	tabs = chrome.tabs;
	NOTIFICATIONS = chrome.notifications;
	browser = chrome;
}
if (!browser.cookies) {
	browser.cookies = browser.experimental.cookies;
}
function isDevMode() {
    return !('update_url' in browser.runtime.getManifest());
}
function IsNullOrWhitespace(input) {
  return !input || !input.trim();
}

function log_message(t) {
	if (isDevMode())
		console.log(t);
}
var MOTD = "Fix for May 2026 API changes.";

// translates storage.local.get (fundamentally callback-based) into an await-able function
async function getStorageAsync(keys) {
	return new Promise((resolve) => {
		storage.local.get(keys, (result) => {
			resolve(result);
		});
	});
}

// var API_URL = 'https://api.piczel.tv/'
var API_URL = 'https://piczel.tv/api/'
var STATIC_URL = 'https://piczel.tv/static'
var WATCH_URL = "http://piczel.tv/watch/"
async function ajax(url, method, dataType, contentType) {
	let _r = null;
	await new Promise(async (resolve) => {
		try {
			await $.ajax({
				url: url,
				method: "GET",
				dataType: dataType,
				crossDomain: true,
				contentType: contentType,
				cache: false,
				beforeSend: function (xhr) {
					// xhr.setRequestHeader('access-token', auth_bear);
					// xhr.setRequestHeader('Client', client);
					// xhr.setRequestHeader('uid', uid);
					xhr.setRequestHeader('Cache-Control', 'no-cache');
					xhr.setRequestHeader('Pragma', 'no-cache');
				},
				success: function (r, status, xhr) {
					// typeof callback === 'function' && callback(r, status, xhr);
					_r = r;
					resolve();
				},
				error: function (jqXHR, textStatus, errorThrown) {
					// if (!failure) {
					console.log(errorThrown);
					console.log(textStatus);
					console.log(jqXHR.responseText);
					// }
					if (jqXHR.responseText.includes("sign in"))
						NEXT_ERROR = 2;
					// typeof failure === 'function' && failure(jqXHR.responseJSON, textStatus, errorThrown);
					// return null;
					resolve();
				}
			});
		} catch (e) {
			//
			resolve();
		}
	});
	return _r;
}
async function getAPI(url) {
	return await ajax(API_URL + url, "GET", "json", "application/json; charset=utf-8");
}
async function postAPI(url) { // currently unused
	return await ajax(API_URL + url, "POST", "json", "application/json; charset=utf-8");
	// await $.ajax({
	// 	url: API_URL + url,
	// 	method: "POST",
	// 	// crossDomain: true,
	// 	contentType: "application/json; charset=utf-8",
	// 	cache: false,
	// 	/* beforeSend: function (xhr) {
	// 		xhr.setRequestHeader("Authorization", "Bearer " + token);
	// 	}, */
	// 	success: function (r) {
	// 		typeof callback === 'function' && callback(r);
	// 	},
	// 	error: function (jqXHR, textStatus, errorThrown) {
	// 		console.log(textStatus);
	// 		console.log(errorThrown);
	// 	}
	// });
}

function timeAgo(timestamp, locale = 'en') {
	let value;
	const diff = (new Date().getTime() - timestamp) / 1000;
	const minutes = Math.floor(diff / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const months = Math.floor(days / 30);
	const years = Math.floor(months / 12);
	const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

	// if (years > 0)
	// 	return rtf.format(0 - years, "year");
	// else if (months > 0)
	// 	return rtf.format(0 - months, "month");
	// else if (days > 0)
	// 	return rtf.format(0 - days, "day");
	// else if (hours > 0)
	// 	return rtf.format(0 - hours, "hour");
	// else if (minutes > 0)
	// 	return rtf.format(0 - minutes, "minute");
	// else
	return rtf.format(0 - diff, "second");
}

var DING = new Audio('audio/ding.ogg');
function notify(name, type, avatarurl) {
	
	if (type == "live") {
		if (SETTINGS.notifications) {
			let timestamp = new Date().getTime();
			let id = name + '__@@' + timestamp;
			browser.notifications.create(id, {
				type: "basic",
				iconUrl: avatarurl,
				title: "Currently streaming on Piczel:",
				message: name
			}, function() {});
			if (SETTINGS.alert)
				DING.play();
		}
	}
}

// Piczel data
var OWNNAME = "";				// required for certain API paths, like multistreams
var GLOBAL_LIVE_STREAMS = {};	// --DICTIONARY-- site-wide people currently live
var MY_FOLLOWS = [];			// --ARRAY-- this user's own follow list
var LIVE_COUNT = 0;
var INVITES_COUNT = 0;
var NOTIFICATIONS = 0;
var NEXT_ERROR = 0;

// API fetches on update --ASYNC-BASED--
async function fetch_streams() {
	// followed streams -- requires user being logged in
	let r = await getAPI('users/me/following');
	if (r == null)
		return false;
	MY_FOLLOWS = getSimpleFollowedList(r);

	// global current live streams
	let q = await getAPI('streams');
	if (q == null)
		return false;
	GLOBAL_LIVE_STREAMS = getFormattedStreamData(q);

	return true;
}
async function fetch_ownname() {
	if (OWNNAME == "") {
		log_message("No name set... check storage");
		
		let r = await getStorageAsync(["MYNAME"]);
		if (r["MYNAME"]) {
			OWNNAME = r["MYNAME"];
			return true;
		} else {
			log_message("No name in cache... fetching!");
			
			let r = await getAPI("users/me");
			if (r == null)
				return false;
			OWNNAME = r.username;
			storage.local.set({"MYNAME" : OWNNAME});
			log_message("Name set to: " + OWNNAME);
			return true;
		}
	}
	return true;
}
async function fetch_multistream() {
	let r = await getAPI('streams/' + OWNNAME + '/multi'); // multistream info
	if (r == null)
		return false;
	INVITES_COUNT = 0;
	for (m in r.received) {
		if (!r.received[m].accepted)
			INVITES_COUNT++;
	}
	storage.local.set({"MULTISTREAM" : r});
	return true;
}
async function fetch_notifications(callback, failure) { // TODO?
	return true;
}

// extension updates --CALLBACK-BASED--
function updateLive(callback) {
	
	LIVE_COUNT = 0;
	
	// get the cached list of live users and update accordingly!
	storage.local.get("LIVE", function(items) {
		
		// cached list of followed, live people displayed on the extension from the last update
		let livecache = items["LIVE"];
		if (typeof livecache !== typeof {})
			livecache = {};

		// loop through cached users to update for removal
		for (username in livecache) {
			if (!(username in GLOBAL_LIVE_STREAMS)) {
				delete livecache[username];
				log_message("User '" + username + "' no longer online (removed from cache)");
			}
		}
		
		// add any new livestreams and dispatch notifications
		let cleanData = {};
		let _i = 0;
		for (i in MY_FOLLOWS) {
			let username = MY_FOLLOWS[i];
			if (username in GLOBAL_LIVE_STREAMS) {
				let formatted = GLOBAL_LIVE_STREAMS[username];
				if (!(username in livecache)) {
					log_message(username + " just started streaming! (" + timeAgo(formatted.live_since) + ")");
					notify(username, "live", formatted.avatarurl); // dispatch live notification (or not)
				}
				cleanData[username] = formatted;
			}
			_i = parseInt(i) + 1;
		}

		// update final live count
		LIVE_COUNT = Object.keys(cleanData).length;
		if (LIVE_COUNT == 0)
			log_message("No users streaming.");
		
		browser.storage.local.set({"LIVE" : cleanData}, function() { // synchronous, but returns promise on success
			typeof callback === 'function' && callback();
		});
	});
}
function updateBadge(callback) {
	browser.browserAction.setBadgeBackgroundColor( { color: SETTINGS.badgecolor} );
			
	var badgetext = "";
	var badgetooltip = "";
	
	if(SETTINGS.badgenotif) {
		if (NOTIFICATIONS == 1) {
			badgetext = "1";
			badgetooltip = "1 person streaming";
		} else if (NOTIFICATIONS > 1) {
			badgetext = NOTIFICATIONS.toString();
			badgetooltip = NOTIFICATIONS.toString() + " notifications";
		} else {
			var badgetext = "";
			var badgetooltip = "";
		}
		browser.browserAction.setBadgeText({"text": badgetext});
		browser.browserAction.setTitle({"title": badgetooltip});
	}
	else {
		if (SETTINGS.streamer) {
			
			if (LIVE_COUNT == 1) {
				badgetext = "1";
				badgetooltip = "1 person streaming";
			} else if (LIVE_COUNT > 1) {
				badgetext = LIVE_COUNT.toString();
				badgetooltip = LIVE_COUNT.toString() + " people streaming";
			} else {
				badgetext = "";
				badgetooltip = "";
			}
			if (LIVE_COUNT > 0) {
				if (INVITES_COUNT == 1) {
					badgetext = badgetext + ", 1";
					badgetooltip = badgetooltip + ", 1 invite";
				} else if (INVITES_COUNT > 1) {
					badgetext = badgetext + ", " + INVITES_COUNT.toString();
					badgetooltip = badgetooltip + ", " + INVITES_COUNT.toString() + " invites";
				}
			}
			else {
				if (INVITES_COUNT == 1) {
					badgetext = "1";
					badgetooltip = "1 invite";
				} else if (INVITES_COUNT > 1) {
					badgetext = INVITES_COUNT.toString();
					badgetooltip = INVITES_COUNT.toString() + " invites";
				}
			}
			browser.browserAction.setBadgeText({"text": badgetext});
			browser.browserAction.setTitle({"title": badgetooltip});
		}
		else {		
			if (LIVE_COUNT == 1) {
				badgetext = "1";
				badgetooltip = "1 person streaming";
			} else if (LIVE_COUNT > 1) {
				badgetext = LIVE_COUNT.toString();
				badgetooltip = LIVE_COUNT.toString() + " people streaming";
			} else {
				badgetext = "";
				badgetooltip = "";
			}
			browser.browserAction.setBadgeText({"text": badgetext});
			browser.browserAction.setTitle({"title": badgetooltip});
		}
	}
	
	typeof callback === 'function' && callback();
}
function updateMOTD() {
	let version = browser.runtime.getManifest().version;	
	if (SETTINGS.updatemsg) {
		storage.sync.get(["MOTD"], (r) => {
			if ((r["MOTD"] && r["MOTD"] != "" && r["MOTD"].split('.').slice(0,2).join(".") != version.split('.').slice(0,2).join(".")) || !r["MOTD"] || r["MOTD"] == "") {
				browser.notifications.create("MOTD", {
					type: "basic",
					iconUrl: "icons/icon256.png",
					title: "Piczel Notifier updated to " + version.toString().substr(0, 3) + "!",
					message: MOTD
				}, function() {});
			}
			storage.sync.set({"MOTD" : version});
		});
	}
	else
		storage.sync.set({"MOTD" : version});
}

// these below are the **CORE FUNCTIONS** translating the raw exploreData fields into formatted data!
function getFormattedStreamData(raw_data) {
	let formatted_data = {};
	for (i in raw_data) {
		let raw = raw_data[i];
		formatted_data[raw.username] = {
			"live": raw.live,
			"live_since" : Date.parse(raw.live_since),
			"adult" : raw.adult,
			"viewers" : raw.viewers,
			"avatarurl": raw.user.avatar.url
		};
	}
	return formatted_data;
}
function getSimpleFollowedList(raw_data) {
	let list = [];
	for (i in raw_data)
		list.push(raw_data[i].stream_username);
	return list;
}

// get default settings or fetch from storage
let SETTINGS_DEFAULTS = {};
var SETTINGS = {};
function initSettings(callback) {
	const url = browser.runtime.getURL('defaults.json');
	fetch(url)
		.then(e => e.json())
		.then(j =>
	{
		SETTINGS_DEFAULTS = j;
		SETTINGS = {
			...SETTINGS_DEFAULTS
		};
		callback();
	});
}

// main update function
var UPDATER = null;
async function update() {

	// fetch piczel data
	if (await fetch_streams())
		if (await fetch_ownname())
			if (await fetch_multistream())
				if (await fetch_notifications()) { // does nothing atm.
					// ...
				}
	
	// update badge and live count without fetching from Piczel...
	updateLive(() => {
		updateBadge(() => {
			updateMOTD(() => {
				// ...
			});
		});
	});
				
	storage.local.set({"ERROR" : NEXT_ERROR});
	NEXT_ERROR = 0;
	UPDATER = setTimeout(update, SETTINGS.updateinterval * 1000);
}
function startup() {
	storage.sync.get(["SETTINGS"], (r) => {
		for (let a in r["SETTINGS"]) {
			let setting = r["SETTINGS"][a];
			SETTINGS[a] = setting;
		}
		
		// set notif volume
		DING.volume = parseFloat(SETTINGS.dingvolume) / 100;
		
		// start the update!
		if (!UPDATER)
			update();
	});
}
function restart() {
	initSettings(startup);
}

// start!
restart();

// add listener to the desktop notification popups
browser.notifications.onClicked.addListener(function(notificationId) {
	if (notificationId !== "MOTD") {
		log_message("Notification clicked! ID: " + notificationId);
	
		window.open('https://piczel.tv/watch/' + notificationId.substr(0, notificationId.indexOf('__@@')), '_blank');
		browser.notifications.clear(notificationId, function() {});
	}
});

// listen for messages from other pages
browser.runtime.onMessage.addListener(function(request, sender, sendResponse) {
		switch (request.message) {
		case "setCount":
			setCount(request.count);
			break
		case "settingChanged":
			if (isDevMode()) {
				console.log("Settings updated!");
			}
			for (s in request) {
				if (s != "message") {
					SETTINGS[s] = request[s];
				}
			}
			restart();
			break
		case "updateAll":
			restart();
			break
		case "purgeAll":
			SETTINGS = {};
			LIVE_COUNT = 0;
			INVITES_COUNT = 0;
			OWNNAME = "";
			MY_FOLLOWS = [];
			API_TOKEN = "";
			restart();
			break;
		case "notificationRemoved":
			NOTIFICATIONS -= 1;
			updateBadge();
			break;
		case "oauth":
			OAuthConnect(true, function() {
				browser.browserAction.getBadgeText({}, function(result) {
					sendResponse("OK");
				});
			});
			return true;
		case "getBadgeText":
			if (isDevMode()) {
				console.log("getBadgeText");
			}
			browser.browserAction.getBadgeText({}, function(result) {
				sendResponse(result);
			});
			return true;
		case "tabID":
			sendResponse({tab: sender.tab.id});
			break;
		}
		return false;
});