/*
    ROUTING MODEL for Users (Caretakers)
*/

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const passport = require('passport');
var moment = require('moment');
const { ensureAuthenticated } = require('../config/auth');

// Mailer
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey('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');

// User model
const User = require('../models/User');


// GET home page
router.get('/home', ensureAuthenticated, function (req, res, next) {
    var date = moment().format('MMMM Do YYYY');
    res.render('pages/users/home', {
        date: date
    });
});


// GET settings page
router.get('/settings', function (req, res, next) {
    res.render('pages/users/profile', {
        isAdmin: req.user.admin
    })
});


// GET reminder page
router.get('/reminders', function (req, res, next) {
    res.render('pages/users/reminder');
});


// Register Handle
router.post('/register', (req, res) => {
    // Information access
    if(req.user.admin != true) {
        console.log("Not admin");
        return;
    }
    const {
        first_name,
        last_name,
        email,
        password,
        password2
    } = req.body;

    const newUser = new User({
        first_name,
        last_name,
        email,
        password
    });
    // Hash user password
    bcrypt.genSalt(10, (err, salt) => {
        bcrypt.hash(newUser.password, salt, (err, hash) => {
            if (err) throw err;
            // Assign user password as hashed password 
            newUser.password = hash;
            // Insert user into DB
            // TODO: Reassign to Redis
            newUser
                .save()
                .then(user => {
                    // Redirect to login page
                    res.redirect('/login');
                })
                .catch(err => console.log(err));
        });
    });
});


// Login Handle
router.post('/login', (req, res, next) => {
    passport.authenticate('local', {
        // Redirects on both success and fail
        successRedirect: '/login/loader',
        failureRedirect: '/login',
        failureFlash: true
    })(req, res, next);
});


// Logout Handle
router.get('/logout', (req, res) => {
    req.logout();
    res.redirect('/logout/loader');
});


// Update Password Handle
router.post('/changePassword', ensureAuthenticated, (req, res) => {
    // Get params
    const {
        current_password,
        new_password,
        confirm_new_password
    } = req.body;
    // Compare new passwords 
    if (new_password == confirm_new_password) {
        // Verify user
        bcrypt.compare(current_password, req.user.password, (err, isMatch) => {
            if (isMatch) {
                // Hash password and update
                bcrypt.genSalt(10, (err, salt) => {
                    bcrypt.hash(new_password, salt, (err, hash) => {
                        if (err) throw err; 
                        // Reassign user password
                        User.findOneAndUpdate(
                            {"email": req.user.email}, 
                            {$set: {"password": hash}},
                            function(err) {
                                if (err) console.log(err);
                                req.flash('success', 'Password successfully updated.')
                            }
                        );
                        console.log("Password successfully changed");
                    });
                });
            }
            else {
                console.log("Password incorrect");
            }
        });
    }
    else {
        console.log("Passwords don't match");
    } 
    return res.redirect('/users/settings');
});


/* 
    Get reset password page
*/
router.get('/resetRequest' /* , ensureReset */, function (req, res, next) {
    res.render('pages/landing/resetRequest');
});


/* 
    Reset Password Handle
    TODO
*/
router.post('/resetRequest', (req, res) => {
    // Get post params
    const {
        email
    } = req.body;
    // Attempt to locate user
    User.findOne({ email: email })
                .then(user => {
                    // If no match, return with no user param
                    if (!user) {
                        // TODO: Flash message with user notification
                        console.log('No user associated with email');
                        req.flash('failure', 'No user associated with email');
                    }
                    // Send email with reset instructions & notify user
                    else {
                        // TODO: Flash message with user notification
                        req.flash('success', 'An email with instructions has been sent to the associated address');
                        console.log('User matched; recovering');
                        
                        user.generatePasswordReset();
                        console.log('Generated Password Token');
                        // Save the updated user object
                        user.save()
                            .then(user => {
                                // send email
                                let link = "http://" + req.headers.host + "/users/reset/" + user.resetPasswordToken;
                                const mailOptions = {
                                    to: user.email,
                                    from: {"email" : "CareAssistHelp@gmail.com"},
                                    subject: "CareAssist password reset",
                                    text: `Hi ${user.first_name}, \n 
                                Please click on the following link ${link} to reset your password. \n\n`,
                                };

                                sgMail.send(mailOptions, (error, result) => {
                                    if (error) {
                                        console.log(error);
                                        console.log(error.response.body);
                                    }
                                    console.log('Success. Email sent.');
                                });
                            })
                            .catch(err => console.log(err));
                    }
                })
                .catch(err => console.log(err));
    return res.render('pages/landing/resetRequest');
});


/* 
    Get reset password page
    Using ensureReset middleware to verify token access to route/page
    TODO: Flash messages
*/
router.get('/reset/:token' /* , ensureReset */ , function (req, res, next) {
    User.findOne({resetPasswordToken: req.params.token, resetPasswordExpires: {$gt: Date.now()}})
        .then((user) => {
            if (!user) {
                console.log('Invalid token');
                res.redirect('/login');
            }
            res.render('pages/landing/reset', {user});
        })
        .catch(err => res.status(500).json({message: err.message}));
});


/* 
    Reset Password Handle
    TODO: Flash messages
*/
router.post('/reset', (req, res) => {
    // Get post params
    const {
        new_password,
        confirm_new_password,
        token
    } = req.body;
    // Find user with valid token
    User.findOne({resetPasswordToken: token, resetPasswordExpires: {$gt: Date.now()}})
        .then((user) => {
            // Invalid token
            if (!user) {
                console.log('Invalid token');
                res.redirect('/login');
            }
            // Attempt password change
            // TODO: Ensure password fulfills prerequisites 
            else {
                if (new_password == confirm_new_password) {
                    // Hash password and update
                    bcrypt.genSalt(10, (err, salt) => {
                        bcrypt.hash(new_password, salt, (err, hash) => {
                            if (err) throw err; 
                            // Reassign user password
                            const params = {
                                "password": hash,
                                "resetPasswordToken": undefined,
                                "resetPasswordExpires": undefined
                            };
                            User.findOneAndUpdate(
                                {"email": user.email}, 
                                {$set: params},
                                function(err) {
                                    if (err) console.log(err);
                                }
                            );
                        });
                    });
                    console.log("Password successfully changed");
                    res.redirect('/login');
                }
                else {
                    console.log("Passwords do not match");
                    res.render('pages/landing/reset', {user});
                }
            }
        })
        .catch(err => console.log(err));
});


// Change Information Handle
router.post('/changeInfo', ensureAuthenticated, (req, res) => {
    // Get params
    var {
        first_name,
        last_name,
        new_email
    } = req.body;
    // Update email
    if ((new_email != req.user.email) && (new_email.length > 0)) {
        // TODO
        req.flash('success', 'An email has been sent to the new address', new_email);
        req.user.generateEmailUpdate();
        req.user.updateEmail = new_email;
        // Save the updated user object
        req.user.save()
        .then(user => {
            // send email
            let link = "http://" + req.headers.host + "/users/updateEmail/" + user.updateEmailToken;
            const mailOptions = {
                to: user.updateEmail,
                from: {"email" : "CareAssistHelp@gmail.com"},
                subject: "CareAssist email change",
                text: `Hi ${user.first_name}, \n 
            Please click on the following link ${link} to update your email. \n\n`,
            };

            sgMail.send(mailOptions, (error, result) => {
                if (error) {
                    console.log(error);
                    console.log(error.response.body);
                }
                console.log('Success. Email sent.');
            });
        })
        .catch(err => console.log(err));
    }
    // Ensure non-empty fields
    if (first_name.length == 0) {
        first_name = req.user.first_name;
    }
    if (last_name.length == 0) {
        last_name = req.user.last_name;
    }
    var info = {
        "first_name": first_name,
        "last_name": last_name
    }
    // Update name
    User.findOneAndUpdate(
        {"email": req.user.email}, 
        {$set: info},
        function(err) {
            if (err) console.log(err);
            req.flash('success', 'Information successfully updated.')
        }
    );
    return res.redirect('/users/settings');
});


/* 
    Get user email update page
    TODO: Flash messages    
*/
router.get('/updateEmail/:token' /* , ensureReset */ , function (req, res, next) {
    User.findOne({updateEmailToken: req.params.token, updateEmailExpires: {$gt: Date.now()}})
        .then((user) => {
            if (!user) {
                console.log('Invalid token');
                res.redirect('/login');
            }
            else {
                console.log('Valid token, updating user email');
                user.email = user.updateEmail;
                user.updateEmail = undefined;
                user.updateEmailToken = undefined;
                user.updateEmailExpires = undefined;
                user.save()
                    .then()
                    .catch(err => console.log(err));
                res.redirect('/login');
            }
            
        })
        .catch(err => res.status(500).json({message: err.message}));
});

module.exports = router;