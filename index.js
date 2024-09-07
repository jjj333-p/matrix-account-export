//Import dependencies
import {
	// AutojoinRoomsMixin,
	MatrixClient,
	SimpleFsStorageProvider,
	RichRepliesPreprocessor,
} from "matrix-bot-sdk";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import crypto from "node:crypto";
import inquirer from "inquirer";
import { assert } from "node:console";
import YAML from "yaml";
import fs from "node:fs";

//the bot sync something idk bro it was here in the example so i dont touch it ;-;
const storage = new SimpleFsStorageProvider(
	`/tmp/${crypto.randomBytes(32).toString("base64")}.json`,
);

inquirer
	.prompt([
		{
			type: "input",
			name: "operation",
			message: "Are you (I)mporting or (E)xporting: ",
		},
		{
			type: "input",
			name: "filePath",
			message: "Please supply the filepath to write to / read from: ",
		},
		{
			type: "input",
			name: "homeserver",
			message:
				"Please input the url which the client api for your homeserver is available starting with https:// (Commonly https://matrix.example.com or https://chat.example.com): ",
		},
		{
			type: "input",
			name: "mxid",
			message: "Please supply your complete MXID: ",
		},
		{
			type: "password",
			name: "password",
			message: "Enter your password: ",
		},
	])
	.then(async (input) => {
		//put these up top for cleanliness
		assert(
			input.filePath && input.homeserver && input.mxid && input.password,
			"You have failed to provide at least one input.",
		);

		//break off on input type
		switch (input.operation?.toLowerCase()) {
			case "i":
			case "input":
				_import(input);
				break;
			case "e":
			case "export":
				_export(input);
				break;
			default:
				throw "You did not supply a valid operation type.";
		}
	});

async function _export({ filePath, homeserver, mxid, password }) {
	//request body
	const body = {
		password,
		identifier: {
			type: "m.id.user",
			user: mxid,
		},
		initial_device_display_name: "login.js",
		type: "m.login.password",
	};

	//make request
	const a = await fetch(`${homeserver}/_matrix/client/v3/login`, {
		body: JSON.stringify(body),
		method: "POST",
	});

	assert(a, "Failed to log in to account");

	//idk why we have to await it becoming json, just js things ig
	let auth;
	try {
		auth = await a.json();
	} catch (e) {
		throw "Failed to log in to account";
	}

	assert(auth?.user_id, "Failed to log in to account");

	console.log(`Logged into ${auth.user_id}`);

	//login to client
	const client = new MatrixClient(homeserver, auth.access_token, storage);

	let profile;
	try {
		profile = await client.getUserProfile(auth.user_id);
	} catch {
		throw "Could not fetch the account profile.";
	}

	let rooms;
	try {
		rooms = await client.getJoinedRooms();
	} catch (e) {
		throw "Could not fetch joined rooms.";
	}

	const roomSave = [];

	const ourServer = mxid.split(":")[1];

	for (const roomIndex in rooms) {
		console.log(`Working on room ${roomIndex} of ${rooms.length}`);
		const room = rooms[roomIndex];

		const vias = [];
		try {
			for (const member of await client.getJoinedRoomMembers(room)) {
				const s = member.split(":")[1];
				if (ourServer !== s && !vias.includes(s)) vias.push(s);
			}
		} catch (e) {
			console.error(`Couldnt fetch vias for ${room}.`);
		}

		let name;
		try {
			name = (await client.getRoomStateEvent(room, "m.room.name", "")).name;
		} catch (e) {
			console.error(`Couldnt fetch name of ${room}.`);
		}

		roomSave.push({ id: room, name, vias });
	}

	fs.writeFileSync(filePath, YAML.stringify({ profile, roomSave }));

	console.log(`Wrote file to ${filePath}.`);
}

async function _import({ filePath, homeserver, mxid, password }) {
	//request body
	const body = {
		password,
		identifier: {
			type: "m.id.user",
			user: mxid,
		},
		initial_device_display_name: "login.js",
		type: "m.login.password",
	};

	//make request
	const a = await fetch(`${homeserver}/_matrix/client/v3/login`, {
		body: JSON.stringify(body),
		method: "POST",
	});

	assert(a, "Failed to log in to account");

	//idk why we have to await it becoming json, just js things ig
	let auth;
	try {
		auth = await a.json();
	} catch (e) {
		throw "Failed to log in to account";
	}

	assert(auth?.user_id, "Failed to log in to account");

	console.log(`Logged into ${auth.user_id}`);

	//login to client
	const client = new MatrixClient(homeserver, auth.access_token, storage);

	let yamlIN;
	try {
		const data = fs.readFileSync(filePath, "utf-8");
		yamlIN = YAML.parse(data);
	} catch (e) {
		throw `Failed to read and parse ${filePath} with error\n${e}`;
	}

	try {
		if (yamlIN.profile?.avatar_url)
			await client.setAvatarUrl(yamlIN.profile.avatar_url);
	} catch (e) {
		console.warn(`Failed to set Avatar_URL to ${yamlIN.profile?.avatar_url}`);
	}

	try {
		if (yamlIN.profile?.displayname)
			await client.setDisplayName(yamlIN.profile?.displayname);
	} catch (e) {
		console.warn(`Failed to set displayname to ${yamlIN.profile?.displayname}`);
	}

	for (const i in yamlIN.roomSave || []) {
		console.log(`working on room ${i} of ${yamlIN.roomSave}`);
		const room = yamlIN.roomSave[i];

		await client
			.joinRoom(room.id, room.vias || [])
			.then(() => console.log(`Successfully joined ${room.name || room.id}`))
			.catch(() => console.warn(`Failed to join ${room.name || room.id}`));
	}
}
