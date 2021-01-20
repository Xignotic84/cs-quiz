const express = require('express')
const Router = express.Router()
const uniqueString = require('unique-string');
const mtz = require('moment-timezone')

mtz().calendar(null, {
    sameDay: '[Today]',
    nextDay: '[Tomorrow]',
    nextWeek: 'dddd',
    lastDay: '[Yesterday]',
    lastWeek: '[Last] dddd',
    sameElse: 'DD/MM/YYYY'
});

// Listen to endpoints on this route
Router.get('/create', async (req, res, next) => {
    // Render page with data
    res.render('pages/item-create.ejs', {
        pagetitle: 'Home',
        items: [],
        user: req.session.user || false,
    })
})

Router.post('/create', async (req, res, next) => {
    const {name, location} = req.body

    if (!name) return res.status(400).json({message: 'You need to provide an item name'})

    if (!location) return res.status(400).json({message: 'You need to provide the location of the item'})

    req.db.create(2, {
        id: uniqueString(),
        creator: req.session.user.username,
        ...req.body,
        unix_created_at: new Date().getTime()
    })

    // Respond to request with location header and json body with message
    res.header('location', '/').status(200).json({message: `Successfully created item ${name}`})

    req.db.update(1, {id: req.session.user.id}, {$inc: {'analytics.itemCount': 1}})
})

Router.get('/:id', async (req, res) => {
    const id = req.params.id

    // Get item and inspections from db
    const item = await req.db.findOne(2, {id: id})
    const inspections = await req.db.find(3, {item_id: id})
    const guessedTz = mtz.tz.guess()

    inspections.forEach(d => {
        d.inspected = mtz(d.unix_created_at).tz(guessedTz).calendar()
    })

    // Check if item is in db
    if (!item) return res.status(404).render('pages/error.ejs', {
        pagetitle: 'Error',
        error: {
            code: 404, message: 'Not found'
        },
        user: req.session.user || false
    })


    // Render page
    res.status(200).render('pages/item.ejs', {
        pagetitle: `Item | ${item.name}`,
        item: item,
        characteristics: ['Checked the buttons', 'Checked air quality', 'Conducted maintenance'],
        lastInspected: mtz(item.lastInspected).tz(guessedTz).calendar(),
        inspections: inspections.sort((a, b) => b.unix_created_at - a.unix_created_at),
        user: req.session.user || false,
    })
})

Router.post('/:id/delete', async (req, res) => {
    const id = req.params.id

    // Delete item from db
    await req.db.delete(2, {id: id})

    // Delete inspections from db
    await req.db.deleteMany(3, {item_id: id})

    // Respond to request with location header and json body with message
    res.header('location', '/').status(200).json({message: `Deleted item`})
})

Router.post('/:id/inspect', async (req, res) => {
    const id = req.params.id

    // Check if item exists
    const item = await req.db.findOne(2, {id: id})
    if (!item) res.status(404).json({message: 'No item was found with this ID'})

    const {note, characteristic} = req.body

    if (!note && !characteristic) return res.status(400).json({message: 'You need to provide a note or charasteristic'})

    if (note.length > 300) return res.status(400).json({message: 'You cannot provide a note longer than 300 characters'})

    if (characteristic.length > 300) return res.status(400).json({message: 'You cannot provide a characteristic longer than 300 characters'})

    // Create new inspection in db
    req.db.create(3, {
        id: uniqueString(),
        creator: req.session.user.username,
        item_id: id,
        note: note || "None Provided",
        characteristic: characteristic || "None Provided",
        lastInspected: new Date().getTime(),
        unix_created_at: new Date().getTime(),
    })

    req.db.update(2, {id: id}, {lastInspected: new Date().getTime()})

    // Respond to request with location header and json body with message
    res.header('location', `/item/${id}`).status(200).json({message: `Inspected ${item.name}`})

    req.db.update(1, {id: req.session.user.id}, {$inc: {'analytics.inspectedCount': 1}})
})


Router.post('/:_id/inspect/:id/delete', async (req, res) => {
    const {id, _id} = req.params

    // Delete item from db
    await req.db.delete(3, {id: id})


    // Respond to request with location header and json body with message
    res.header('location', `/item/${_id}`).status(200).json({message: `Deleted inspection`})
})

module.exports = Router
