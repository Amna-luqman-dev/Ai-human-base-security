export default function RegisterPage() {
    return (
        <section className="min-h-screen flex items-center justify-center bg-gray-200 px-4">
            {/* Main Form Box - Saari fields is ek card me aayengi */}
            <form className="w-full max-w-md bg-white rounded-lg shadow-xl p-6 flex flex-col gap-4">
                <h2 className="text-2xl font-bold text-gray-800 text-center mb-2">
                    Create an Account
                </h2>

                {/* Name Field */}
                <div>
                    <label htmlFor="name" className="block text-sm
                     font-medium text-gray-700 mb-1">
                        Name
                    </label>
                    <input 
                        type="text" 
                        id="name" 
                        name="name" 
                        placeholder="Enter your name"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                </div>

                {/* Email Field */}
                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                    </label>
                    <input 
                        type="email" 
                        id="email" 
                        name="email" 
                        placeholder="Enter your email"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                </div>

                {/* Password Field */}
                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                        Password
                    </label>
                    <input 
                        type="password" 
                        id="password" 
                        name="password" 
                        placeholder="Enter your password"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                </div>

                {/* Submit Button */}
                <button 
                    type="submit" 
                    
                    className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition mt-2"
                >
                    Register
                </button>
                <div>
                    <a href="/" className="text-blue-600   align-center flex justify-center font-medium ">
                        <span className="text-gray-500 ">Already have an account?</span>   
                        <span className="hover:underline">Login</span>
                        
                    </a>
                </div>
            </form>
        </section>
    );
}