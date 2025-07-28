const express = require('express');
const router = express.Router();
const { default: mongoose } = require('mongoose');
const hasAccess = require('../middleware/hasAccess');
const Account = require('../models/Account');
const Business = require('../models/Business');
const authenticate = require('../middleware/authenticate');

router.post('/create', async(req,res)=>{
    try{
        const {name,email} = req.body;
        const branchData = {
            name,
            email,
            isActive:true
        }
        const business = new Business(branchData)
        await business.save()
        res.status(200).send(business)
    }catch(err){
        console.log(err)
        res.send(err)
    }
})

module.exports = router