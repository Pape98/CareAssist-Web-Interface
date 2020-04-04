/*
    Middleware file to authenticate if a user is logged WITH admin credentials
    Using Passport's "isAuthenticated" to verify current user logged in
*/
module.exports = {
    ensureAdmin: function(req, res, next) {
        if(req.isAuthenticated()) {
            if(req.user.admin == true) {
                return next();
            }
            console.log("Not admin");
            res.redirect('/user/home');
        }
        console.log("Not logged in");
        res.redirect('/login');
    }
}