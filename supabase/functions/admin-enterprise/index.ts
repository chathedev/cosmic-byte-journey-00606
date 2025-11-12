import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CompanyMember {
  id: string;
  userId: string;
  email: string;
  role: string;
  companyId: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user is authenticated and is an admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('email', user.email)
      .in('role', ['admin', 'owner'])
      .single();

    if (roleError || !roleData) {
      console.error('Role check error:', roleError);
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse the URL to get the company ID
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const companyId = pathParts[pathParts.length - 1];

    if (!companyId) {
      return new Response(
        JSON.stringify({ error: 'Company ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Deleting company:', companyId);

    // Fetch company details before deletion
    const { data: company, error: companyError } = await supabase
      .from('enterprise_companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      console.error('Company fetch error:', companyError);
      return new Response(
        JSON.stringify({ error: 'Company not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all company members
    const { data: members, error: membersError } = await supabase
      .from('enterprise_members')
      .select('*')
      .eq('companyId', companyId);

    if (membersError) {
      console.error('Members fetch error:', membersError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch company members' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${members?.length || 0} members to process`);

    // Process each member - downgrade them unless they have another enterprise membership
    const downgradePromises = (members || []).map(async (member: CompanyMember) => {
      // Check if user has other enterprise memberships
      const { data: otherMemberships, error: otherError } = await supabase
        .from('enterprise_members')
        .select('id')
        .eq('userId', member.userId)
        .neq('companyId', companyId);

      if (otherError) {
        console.error(`Error checking other memberships for user ${member.userId}:`, otherError);
        return { userId: member.userId, downgraded: false, error: otherError.message };
      }

      // If user has no other enterprise memberships, downgrade to free
      if (!otherMemberships || otherMemberships.length === 0) {
        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update({ plan: 'free', updatedAt: new Date().toISOString() })
          .eq('userId', member.userId);

        if (updateError) {
          console.error(`Error downgrading user ${member.userId}:`, updateError);
          return { userId: member.userId, downgraded: false, error: updateError.message };
        }

        console.log(`Downgraded user ${member.userId} to free plan`);
        return { userId: member.userId, downgraded: true };
      } else {
        console.log(`User ${member.userId} has other enterprise memberships, not downgrading`);
        return { userId: member.userId, downgraded: false, reason: 'has_other_memberships' };
      }
    });

    const downgradeResults = await Promise.all(downgradePromises);

    // Delete all company memberships
    const { error: deleteMembersError } = await supabase
      .from('enterprise_members')
      .delete()
      .eq('companyId', companyId);

    if (deleteMembersError) {
      console.error('Error deleting members:', deleteMembersError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete company members', details: deleteMembersError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Deleted ${members?.length || 0} member records`);

    // Delete the company
    const { error: deleteCompanyError } = await supabase
      .from('enterprise_companies')
      .delete()
      .eq('id', companyId);

    if (deleteCompanyError) {
      console.error('Error deleting company:', deleteCompanyError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete company', details: deleteCompanyError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Company deleted successfully');

    // Return success with summary
    return new Response(
      JSON.stringify({
        removed: true,
        company: {
          id: company.id,
          name: company.name,
          memberCount: members?.length || 0,
          downgraded: downgradeResults.filter(r => r.downgraded).length,
          results: downgradeResults
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
