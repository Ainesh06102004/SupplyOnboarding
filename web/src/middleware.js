import { NextResponse } from 'next/server';

export function middleware(request) {
  const token = request.cookies.get('koi-auth-token')?.value;
  const { pathname } = request.nextUrl;

  const protectedRoutes = ['/store/profile', '/store/checkout', '/store/orders'];

  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));

  if (isProtectedRoute && !token) {
    const loginUrl = new URL('/store/shop', request.url);
    // Add a parameter to tell the shop page to open the login modal
    loginUrl.searchParams.set('login', 'required');
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/store/profile/:path*', '/store/checkout/:path*', '/store/orders/:path*'],
};
