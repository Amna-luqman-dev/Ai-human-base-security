
import React from 'react'

export default function LoginPage() {
  return (
    <section className="min-h-screen flex items-center justify-center bg-gray-800 px-4">

      <section className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">

        {/* Heading */}
        <section className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">
            Welcome Back
          </h1>

          <p className="text-gray-500 mt-2">
            Login to your account
          </p>
        </section>

        <form className="space-y-5">

          {/* Name */}
          <section>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Name
            </label>

            <input
              type="text"
              id="name"
              name="name"
              placeholder="Enter your name"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </section>

          {/* Email */}
          <section>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Email
            </label>

            <input
              type="email"
              id="email"
              name="email"
              placeholder="Enter your email"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </section>

          {/* Password */}
          <section>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Password
            </label>

            <input
              type="password"
              id="password"
              name="password"
              placeholder="Enter your password"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </section>

          

          {/* Login Button */}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 active:scale-[0.98] transition duration-200"
          >
            Login
          </button>
          {/* Forgot Password */}
          <section className="flex justify-center align-center mb-4">
            <a
              href="#"
              className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
            >
              Forgot password?
            </a>
          </section>

          {/* Register */}
          <p className="text-center text-sm text-gray-500">
            Don't have an account?{" "}
            <a
              href="/register"
              className="text-blue-600 font-medium hover:underline"
            >
              Register
            </a>
          </p>

        </form>
      </section>
    </section>
  )
}

