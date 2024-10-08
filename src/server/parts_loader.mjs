import { getUserDictionary } from './auth.mjs'
import { on_shutdown } from './on_shutdown.mjs'
import fs from 'fs'
import url from 'url'
import { __dirname } from './server.mjs'
import { loadData, saveData } from './setting_loader.mjs'

let parts_set = {}

function GetPartPath(username, parttype, partname) {
	let userPath = getUserDictionary(username) + '/' + parttype + '/' + partname
	if (fs.existsSync(userPath + '/main.mjs'))
		return userPath
	return __dirname + '/src/public/' + parttype + '/' + partname
}

export async function baseloadPart(username, parttype, partname, {
	pathGetter = () => GetPartPath(username, parttype, partname),
	Loader = async (path) => {
		const part = (await import(url.pathToFileURL(path + '/main.mjs'))).default
		return part
	},
} = {}) {
	if (!parts_set?.[username]?.[parttype])
		return await Loader(pathGetter())
	return parts_set[username][parttype][partname]
}

export async function loadPart(username, parttype, partname, Initargs, {
	pathGetter = () => GetPartPath(username, parttype, partname),
	Loader = async (path, Initargs) => {
		const part = (await import(url.pathToFileURL(path + '/main.mjs'))).default
		part.Load(Initargs)
		return part
	},
	afterLoad = (part) => { },
	Initer = async (path, Initargs) => {
		const part = (await import(url.pathToFileURL(path + '/main.mjs'))).default
		if (part.Init)
			try {
				part.Init(Initargs)
			}
			catch (error) {
				fs.rmSync(path, { recursive: true, force: true })
				throw error
			}
		return part
	},
	afterInit = (part) => { },
} = {}) {
	parts_set[username] ??= { // 指定卸载顺序 shell > world > char > persona > AIsource > AIsourceGenerator
		shells: {},
		worlds: {},
		chars: {},
		personas: {},
		AIsources: {},
		AIsourceGenerators: {},
	}
	parts_set[username][parttype] ??= {}
	let parts_init = loadData(username, 'parts_init')
	if (!parts_init[parttype]?.[partname]) {
		initPart(username, parttype, partname, Initargs, { pathGetter, Initer, afterInit })
		parts_init[parttype] ??= {}
		parts_init[parttype][partname] = true
		saveData(username, 'parts_init')
	}
	if (!parts_set[username][parttype][partname]) {
		parts_set[username][parttype][partname] = await Loader(pathGetter(), Initargs)
		afterLoad(parts_set[username][parttype][partname])
	}
	return parts_set[username][parttype][partname]
}

export function initPart(username, parttype, partname, Initargs, {
	pathGetter = () => GetPartPath(username, parttype, partname),
	Initer = async (path, Initargs) => {
		const part = (await import(url.pathToFileURL(path + '/main.mjs'))).default
		if (part.Init)
			try {
				part.Init(Initargs)
			}
			catch (error) {
				fs.rmSync(path, { recursive: true, force: true })
				throw error
			}
		return part
	},
	afterInit = (part) => { },
} = {}) {
	let part = Initer(pathGetter(), Initargs)
	afterInit(part)
}

export function unloadPart(username, parttype, partname, unLoadargs, {
	unLoader = (part) => part.Unload(unLoadargs),
} = {}) {
	const part = parts_set[username][parttype][partname]
	try {
		unLoader(part)
	}
	catch (error) {
		console.error(error)
	}
	delete parts_set[username][parttype][partname]
}
on_shutdown(() => {
	for (let username in parts_set)
		for (let parttype in parts_set[username])
			for (let partname in parts_set[username][parttype])
				unloadPart(username, parttype, partname)
})

export function uninstallPart(username, parttype, partname, unLoadargs, uninstallArgs, {
	unLoader = (part) => part.Unload(unLoadargs),
	pathGetter = () => GetPartPath(username, parttype, partname),
	Uninstaller = (part, path) => {
		part.Uninstall(uninstallArgs)
		fs.rmSync(path, { recursive: true, force: true })
	}
} = {}) {
	const part = parts_set[username][parttype][partname]
	try {
		unloadPart(username, parttype, partname, unLoadargs, { unLoader })
	} catch (error) {
		console.error(error)
	}
	Uninstaller(part, pathGetter())
}
